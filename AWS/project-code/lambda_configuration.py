#
# All or portions of this file Copyright (c) Amazon.com, Inc. or its affiliates or
# its licensors.
#
# For complete copyright and license terms please see the LICENSE at the root of this
# distribution (the "License"). All use of this software is governed by the License,
# or, if provided, by the license below or the license accompanying this file. Do not
# remove or modify any license notices. This file is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/lambda_configuration.py#15 $

import properties
import custom_resource_response
import boto3
import json
import discovery_utils
import time
from zipfile import ZipFile, ZipInfo
from StringIO import StringIO
from errors import ValidationError
from botocore.exceptions import ClientError
from uuid import uuid4

iam = boto3.client('iam')
s3 = boto3.client('s3')
 
def handler(event, context):
    
    props = properties.load(event, {
        'ConfigurationBucket': properties.String(),
        'ConfigurationKey': properties.String(),
        'FunctionName': properties.String(),
        'Settings': properties.Object( default={}, 
            schema={
                '*': properties.String()
            }),
        'Runtime': properties.String()
        })

    request_type = event['RequestType']

    if request_type == 'Delete':

        physical_resource_name = event['PhysicalResourceId']
        resource_uuid = physical_resource_name.split(':')[4]

        _delete_role(resource_uuid)

        data = {}

    else:

        if request_type == 'Create':

            resource_uuid = uuid4()

            physical_resource_name = 'CloudCanvas:LambdaConfiguration:{stack_name}:{function_name}:{uuid}'.format(
                stack_name=discovery_utils.get_stack_name_from_stack_arn(event['StackId']), 
                function_name=props.FunctionName,
                uuid=resource_uuid)

            role_arn = _create_role(event['StackId'], props.FunctionName, resource_uuid)

        else: # Update

            physical_resource_name = event['PhysicalResourceId']
            resource_uuid = physical_resource_name.split(':')[4]
            role_arn = _update_role(event['StackId'], props.FunctionName, resource_uuid)

        output_key = '{}/feature-code.zip'.format(props.ConfigurationKey)
        output_key = _inject_settings(props.Settings.__dict__, props.Runtime, props.ConfigurationBucket, output_key, props.FunctionName)

        data = {
            'ConfigurationBucket': props.ConfigurationBucket,
            'ConfigurationKey': output_key,
            'Runtime': props.Runtime,
            'Role': role_arn
        }

    custom_resource_response.succeed(event, context, data, physical_resource_name)


def _inject_settings_python(zip_file, settings):

    first = True
    content = 'settings = {'
    for k, v in settings.iteritems():
        if not first:
            content += ','
        content += '\n    \'{}\': \'{}\''.format(k, v)
        first = False
    content += '\n}'

    print 'inserting settings', content

    info = ZipInfo('CloudCanvas/settings.py')
    info.external_attr = 0777 << 16L # give full access to included file

    zip_file.writestr(info, content)


def _inject_settings_nodejs(zip_file, settings):

    first = True
    content = 'module.exports = {'
    for k, v in settings.iteritems():
        if not first:
            content += ','
        content += '\n    "{}": "{}"'.format(k, v)
        first = False
    content += '\n};'

    print 'inserting settings', content

    info = ZipInfo('CloudCanvas/settings.js')
    info.external_attr = 0777 << 16L # give full access to included file

    zip_file.writestr(info, content)
    

_SETTINGS_INJECTORS = {
    'python2.7': _inject_settings_python,
    'nodejs': _inject_settings_nodejs
}


def _inject_settings(settings, runtime, bucket, input_key, function_name):

    if len(settings) == 0:
        return input_key

    output_key = input_key + '.' + function_name + '.configured'

    injector = _SETTINGS_INJECTORS.get(runtime, None)
    if injector is None:
        raise ValidationError('No setting injector found for runtime {}'.format(runtime))

    res = s3.get_object(Bucket=bucket, Key=input_key)
    zip_content = StringIO(res['Body'].read())
    with ZipFile(zip_content, 'a') as zip_file:
        injector(zip_file, settings)

    res = s3.put_object(Bucket=bucket, Key=output_key, Body=zip_content.getvalue())

    zip_content.close()

    return output_key


def _create_role(stack_arn, function_name, resource_uuid):
    
    role_name = _get_role_name(resource_uuid)

    feature = discovery_utils.FeatureInfo(stack_arn)
    path = '/{project_name}/{deployment_name}/{feature_name}/{function_name}/'.format(
        project_name=feature.deployment.project.project_name,
        deployment_name=feature.deployment.deployment_name,
        feature_name=feature.feature_name,
        function_name=function_name)

    print 'create_role {} with path {}'.format(role_name,path)
    res = iam.create_role(RoleName=role_name, AssumeRolePolicyDocument=ASSUME_ROLE_POLICY_DOCUMENT, Path=path)
    print 'create_role {} result: {}'.format(role_name, res)

    role_arn = res['Role']['Arn']

    _set_role_policy(role_name, stack_arn, function_name)

    # Allow time for the role to propagate before lambda tries to assume 
    # it, which lambda tries to do when the function is created.
    time.sleep(60) 

    return role_arn


ASSUME_ROLE_POLICY_DOCUMENT = '''{
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "sts:AssumeRole",
                "Principal": {
                    "Service": "lambda.amazonaws.com"
                }
            }
        ]
    }'''


def _update_role(stack_arn, function_name, resource_uuid):
    role_name = _get_role_name(resource_uuid)
    res = iam.get_role(RoleName=role_name)
    print 'get_role {} result: {}'.format(role_name, res)
    role_arn = res['Role']['Arn']
    _set_role_policy(role_name, stack_arn, function_name)
    return role_arn


POLICY_NAME='FunctionAccess'


def _delete_role(resource_uuid):
    role_name = _get_role_name(resource_uuid)
    try:
        res = iam.delete_role_policy(RoleName=role_name, PolicyName=POLICY_NAME)
        print 'delete_role_policy(RoleName="{}", PolicyName="{}") response: {}'.format(role_name, POLICY_NAME, res)
    except Exception as e:
        print 'delete_role_policy(RoleName="{}", PolicyName="{}") error: {}'.format(role_name, policy_name, getattr(e, 'response', e))
        if isinstance(e, ClientError) and e.response["Error"]["Code"] not in ["NoSuchEntity", "AccessDenied"]:
            raise e    
        
    res = iam.delete_role(RoleName=role_name)
    print 'delete_role {} result: {}'.format(role_name, res)


def _get_role_name(resource_uuid):
    return 'CC-LambdaConfiguration-{uuid}'.format(uuid=resource_uuid)


def _set_role_policy(role_name, stack_arn, function_name):

    policy = _create_role_policy(stack_arn, function_name)

    if policy is None:
        try:
            res = iam.delete_role_policy(RoleName=role_name, PolicyName=POLICY_NAME)
            print 'delete_role_policy(RoleName="{}", PolicyName="{}") response: {}'.format(role_name, POLICY_NAME, res)
        except Exception as e:
            print 'delete_role_policy(RoleName="{}", PolicyName="{}") error: {}'.format(role_name, POLICY_NAME, getattr(e, 'response', e))
            if isinstance(e, ClientError) and e.response["Error"]["Code"] not in ["NoSuchEntity", "AccessDenied"]:
                raise e    
    else:
        res = iam.put_role_policy(RoleName=role_name, PolicyName=POLICY_NAME, PolicyDocument=policy)
        print 'put_role_policy {} on role {} result: {}'.format(POLICY_NAME, role_name, res)


def _create_role_policy(stack_arn, function_name):

    cf = boto3.client('cloudformation', region_name=discovery_utils.get_region_from_stack_arn(stack_arn))

    try:
        res = discovery_utils.try_with_backoff(lambda : cf.describe_stack_resources(StackName=stack_arn))
        print 'describe_stack_resource(StackName="{}") result: {}'.format(stack_arn, res)
    except Exception as e:
        print 'describe_stack_resource(StackName="{}") error: {}'.format(stack_arn, getattr(e, 'response', e))
        raise e

    policy = {
        'Version': '2012-10-17',
        'Statement': [
            {
                "Sid": "WriteLogs",
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": "arn:aws:logs:*:*:*"
            }
        ]
    }

    for resource in res['StackResources']:
        statement = _make_resource_statement(cf, stack_arn, function_name, resource['LogicalResourceId'])
        if statement is not None:
            policy['Statement'].append(statement)
        
    print 'generated policy: {}'.format(policy)

    return json.dumps(policy, indent=4)


def _make_resource_statement(cf, stack_arn, function_name, logical_resource_name):

    print 'describe_stack_resource on resource {} in stack {}.'.format(logical_resource_name, stack_arn)
    try:
        res = discovery_utils.try_with_backoff(lambda : cf.describe_stack_resource(StackName=stack_arn, LogicalResourceId=logical_resource_name))
        print 'describe_stack_resource {} result: {}'.format(logical_resource_name, res)
    except Exception as e:
        print 'describe_stack_resource {} error: {}'.format(logical_resource_name, getattr(e, 'response', e))
        raise e
    resource = res['StackResourceDetail']

    metadata = _get_metadata_for_function(resource, function_name)
    if metadata is None: 
        return

    metadata_actions = metadata.get('Action', None)
    if metadata_actions is None:
        raise ValidationError('No Action was specified for CloudCanvas FunctionAccess metdata on the {} resource in stack {}.'.format(
            resource['LogicalResourceId'], 
            stack_arn))
    if not isinstance(metadata_actions, list):
        metadata_actions = [ metadata_actions ]
    for action in metadata_actions:
        if not isinstance(action, basestring):
            raise ValidationError('Non-string Action specified for CloudCanvas FunctionAccess metadata on the {} resource in stack {}.'.format(
                resource['LogicalResourceId'], 
                stack_arn))

    resource = discovery_utils.get_resource_arn(stack_arn, resource['ResourceType'], resource['PhysicalResourceId'])

    resource_suffix = metadata.get('ResourceSuffix', None) 
    if resource_suffix is not None:
        resource += resource_suffix

    return {
        'Sid': logical_resource_name + 'Access',
        'Effect': 'Allow',
        'Action': metadata_actions,
        'Resource': resource
    }


def _get_metadata_for_function(resource, function_name):
    
    metadata = discovery_utils.get_cloud_canvas_metadata(resource, POLICY_NAME)

    if metadata is None:
        return None

    if isinstance(metadata, dict):
        metadata = [ metadata ]

    if not isinstance(metadata, list):
        raise ValidationError('FunctionAccess metadata not an object or list on resource {} in stack {}.'.format(
            logical_resource_name,
            stack_arn))

    entry_found = None

    for entry in metadata:

        metadata_function_name = entry.get('FunctionName', None)
        
        if not metadata_function_name:
            raise ValidationError('No FunctionName specified for CloudCanvas FunctionAccess metdata on the {} resource in stack {}.'.format(
                logical_resource_name, 
                stack_arn))

        if not isinstance(metadata_function_name, basestring):
            raise ValidationError('Non-string FunctionName specified for CloudCanvas FunctionAccess metadata on the {} resource in stack {}.'.format(
                logical_resource_name, 
                stack_arn))

        if metadata_function_name == function_name:
            if entry_found is not None:
                raise ValidationError('More than one FunctionAccess metadata entry was found for function {} on resource {} in stack {}.'.format(
                    function_name,
                    logical_resource_name,
                    stack_arn))
            entry_found = entry

    return entry_found

