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
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/player_access.py#3 $

import properties
import custom_resource_response
import boto3
import json

import discovery_utils

from botocore.exceptions import ClientError
from errors import ValidationError

iam = boto3.client('iam')

def handler(event, context):
    
    props = properties.load(event, {
        'ConfigurationBucket': properties.String(), # Currently not used
        'ConfigurationKey': properties.String(),    # Depend on unique upload id in key to force Cloud Formation to call handler
        'FeatureStack': properties.String(default=''),
        'DeploymentStack': properties.String(default='')})

    if props.FeatureStack is '' and props.DeploymentStack is '':
        raise ValidationError('A value for the FeatureStack property or the DeploymentStack property must be provided.')

    if props.FeatureStack is not '' and props.DeploymentStack is not '':
        raise ValidationError('A value for only the FeatureStack property or the DeploymentStack property can be provided.')

    data = {}
    physical_resource_id = 'CloudCanvas:PlayerAccess:{stack_name}'.format(
        stack_name=discovery_utils.get_stack_name_from_stack_arn(event['StackId']))

    if props.FeatureStack is not '':
        
        feature_info = discovery_utils.FeatureInfo(props.FeatureStack)

        # The PlayerAccess resources in feature stacks will be created before
        # the deployment access stack, and the Player role, is created. In 
        # this case it is OK for us to do nothing and wait for the PlayerAccess
        # resource defined by the deployment access stack to be created. It
        # will initialize the role at athat time.
        role_name = _find_player_role(feature_info.deployment)
        if role_name is not None:
            _process_feature_stack(event['RequestType'], feature_info, role_name)

    else: # DeploymentStack
        _process_deployment_stack(event['RequestType'], props.DeploymentStack)

    custom_resource_response.succeed(event, context, data, physical_resource_id)


def _find_player_role(deployment_info):
    deployment_access_stack_info = deployment_info.get_deployment_access_stack_info()
    if deployment_access_stack_info is None:
        return None
    player_resource = deployment_access_stack_info.get_resource('Player', expected_type='AWS::IAM::Role')
    return player_resource['PhysicalResourceId']


def _process_feature_stack(request_type, feature_info, role_name):

    policy_name = feature_info.stack_name

    if request_type == 'Delete':
        _delete_role_policy(role_name, policy_name)
    else: # Update and Delete
        policy_document = _construct_policy_document(feature_info)
        if policy_document is None:
            _delete_role_policy(role_name, policy_name)
        else:
            _put_role_policy(role_name, policy_name, policy_document)


def _process_deployment_stack(request_type, deployment_stack_arn):
    deployment_info = discovery_utils.DeploymentInfo(deployment_stack_arn)
    role_name = _find_player_role(deployment_info)
    if role_name is not None:
        for feature_info in deployment_info.get_feature_infos():
            _process_feature_stack(request_type, feature_info, role_name)


def _construct_policy_document(feature_info):

    policy_document = {
        'Version': '2012-10-17',
        'Statement': []
    }

    for resource in feature_info.get_resources():
        statement = _make_resource_statement(feature_info, resource['LogicalResourceId'])
        if statement is not None:
            policy_document['Statement'].append(statement)
        
    if len(policy_document['Statement']) == 0:
        return None

    print 'constructed policy: {}'.format(policy_document)

    return json.dumps(policy_document, indent=4)


def _make_resource_statement(feature_info, logical_resource_name):

    try:
        response = feature_info.get_client().describe_stack_resource(StackName=feature_info.stack_arn, LogicalResourceId=logical_resource_name)
        print 'describe_stack_resource(LogicalResourceId="{}", StackName="{}") response: {}'.format(logical_resource_name, feature_info.stack_arn, response)
    except Exception as e:
        print 'describe_stack_resource(LogicalResourceId="{}", StackName="{}") error: {}'.format(logical_resource_name, feature_info.stack_arn, e)
        raise e

    resource = response['StackResourceDetail']

    metadata = discovery_utils.get_cloud_canvas_metadata(resource, 'PlayerAccess')
    if metadata is None:
        return None

    metadata_actions = metadata.get('Action', None)
    if metadata_actions is None:
        raise ValidationError('No Action was specified for CloudCanvas PlayerAccess metdata on the {} resource in stack {}.'.format(
            logical_resource_name, 
            feature_info.stack_arn))
    if not isinstance(metadata_actions, list):
        metadata_actions = [ metadata_actions ]
    for action in metadata_actions:
        if not isinstance(action, basestring):
            raise ValidationError('Non-string Action specified for CloudCanvas PlayerAccess metadata on the {} resource in stack {}.'.format(
                logical_resource_name, 
                feature_info.stack_arn))

    if 'PhysicalResourceId' not in resource:
        return None

    return {
        'Sid': logical_resource_name + 'Access',
        'Effect': 'Allow',
        'Action': metadata_actions,
        'Resource': discovery_utils.get_resource_arn(feature_info.stack_arn, resource['ResourceType'], resource['PhysicalResourceId'])
    }


def _put_role_policy(role_name, policy_name, policy_document):
    try:
        response = iam.put_role_policy(RoleName=role_name, PolicyName=policy_name, PolicyDocument=policy_document)
        print 'put_role_policy(RoleName="{}", PolicyName="{}", PolicyDocument="{}") response: {}'.format(role_name, policy_name, policy_document, response)
    except Exception as e:
        print 'put_role_policy(RoleName="{}", PolicyName="{}", PolicyDocument="{}") error: {}'.format(role_name, policy_name, policy_document, e)
        raise e


def _delete_role_policy(role_name, policy_name):
    try:
        response = iam.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
        print 'delete_role_policy(RoleName="{}", PolicyName="{}") response: {}'.format(role_name, policy_name, response)
    except Exception as e:
        print 'delete_role_policy(RoleName="{}", PolicyName="{}") error: {}'.format(role_name, policy_name, e)
        if isinstance(e, ClientError) and e.response["Error"]["Code"] not in ["NoSuchEntity", "AccessDenied"]:
            raise e


