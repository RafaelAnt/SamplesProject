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
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/test/test_player_access.py#3 $

import unittest
import mock
import json
import boto3

from botocore.exceptions import ClientError

from .. import discovery_utils
from .. import errors
from .. import player_access
from .. import custom_resource_response

class TestPlayerAccess(unittest.TestCase):

    event = {}

    context = {}

    def setUp(self):
        reload(player_access)
        self.event = {
            'ResourceProperties': {
                'ConfigurationBucket': 'TestBucket',
                'ConfigurationKey': 'TestKey'
            },
            'StackId': 'TestStackId',
            'LogicalResourceId': 'TestLogicalResourceId'
        }
        self.properties = self.event['ResourceProperties']

    def test_handler_with_no_feature_or_deployment_stack(self):
        print errors.ValidationError
        with self.assertRaises(errors.ValidationError):
            player_access.handler(self.event, self.context)

    def test_handler_with_both_feature_and_deployment_stack(self):
        self.properties['FeatureStack'] = 'TestFeatureStack'
        self.properties['DeploymentStack'] = 'TestDeploymentStack'
        with self.assertRaises(errors.ValidationError):
            player_access.handler(self.event, self.context)

    def test_handler_with_feature_stack_create_without_role(self):
        self._do_handler_with_feature_stack_test('Create', with_access_stack=False)

    def test_handler_with_feature_stack_create_with_role(self):
        self._do_handler_with_feature_stack_test('Create')

    def test_handler_with_feature_stack_update(self):
        self._do_handler_with_feature_stack_test('Update')

    def _do_handler_with_feature_stack_test(self, request_type, with_access_stack = True):

        self.properties['FeatureStack'] = 'TestFeatureStackId'
        self.event['RequestType'] = request_type

        mock_aim_client = mock.MagicMock()
        mock_put_role_policy = mock.MagicMock(return_value={})
        mock_aim_client.put_role_policy = mock_put_role_policy

        def mock_describe_stack_resources_side_effect(PhysicalResourceId=None, StackName=None):
           
            if PhysicalResourceId == 'TestFeatureStackId' or StackName == 'TestDeploymentStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'TestFeatureStackId',
                            'LogicalResourceId': 'TestFeatureStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        }
                    ]
                }

            if PhysicalResourceId == 'TestDeploymentStackId' or StackName == 'TestProjectStackId':
                response = {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'TestDeploymentStackId',
                            'LogicalResourceId': 'TestDeploymentStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        }
                    ]
                }
                if with_access_stack:
                    response['StackResources'].append(
                        {                    
                            'PhysicalResourceId': 'TestDeploymentAccessStackId',
                            'LogicalResourceId': 'TestDeploymentStackNameAccess',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        })
                return response

            if with_access_stack and StackName == 'TestDeploymentAccessStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'PlayerResourceId',
                            'LogicalResourceId': 'Player',
                            'ResourceType': 'AWS::IAM::Role',
                            'StackId': 'TestDeploymentAccessStackId'
                        }
                    ]
                }

            if StackName == 'TestFeatureStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'PlayerAccessibleResourceId1',
                            'LogicalResourceId': 'PlayerAccessibleResourceName1',
                            'ResourceType': 'TestResourceType1',
                            'StackId': 'TestFeatureStackId'
                        },                
                        {
                            'PhysicalResourceId': 'PlayerAccessibleResourceId2',
                            'LogicalResourceId': 'PlayerAccessibleResourceName2',
                            'ResourceType': 'TestResourceType2',
                            'StackId': 'TestFeatureStackId'
                        },                
                        {
                            'PhysicalResourceId': 'NonPlayerAccessibleResourceId',
                            'LogicalResourceId': 'NonPlayerAccessibleResourceName',
                            'ResourceType': 'TestResourceType',
                            'StackId': 'TestFeatureStackId'
                        }
                    ]
                }

            return None

        def mock_describe_stack_resource_side_effect(StackName=None, LogicalResourceId=None):
            
            if StackName != 'TestFeatureStackId':
                return None

            if LogicalResourceId == 'PlayerAccessibleResourceName1':
                return {
                    'StackResourceDetail': {
                        'PhysicalResourceId': 'PlayerAccessibleResourceId1',
                        'LogicalResourceId': 'PlayerAccessibleResourceName1',
                        'ResourceType': 'TestResourceType1',
                        'StackId': 'TestFeatureStackId',
                        'Metadata': '''{
                            "CloudCanvas": {
                                "PlayerAccess": {
                                    "Action": "TestAction1"
                                }
                            }
                        }'''
                    }
                }
            
            if LogicalResourceId == 'PlayerAccessibleResourceName2':
                return {
                    'StackResourceDetail': {
                        'PhysicalResourceId': 'PlayerAccessibleResourceId2',
                        'LogicalResourceId': 'PlayerAccessibleResourceName2',
                        'ResourceType': 'TestResourceType2',
                        'StackId': 'TestFeatureStackId',
                        'Metadata': '''{
                            "CloudCanvas": {
                                "PlayerAccess": {
                                    "Action": [ "TestAction2A", "TestAction2B" ]
                                }
                            }
                        }'''
                    }
                }
            
            if LogicalResourceId == 'NonPlayerAccessibleResourceName':
                return {
                    'StackResourceDetail': {
                        'PhysicalResourceId': 'NonPlayerAccessibleResourceId',
                        'LogicalResourceId': 'NonPlayerAccessibleResourceName',
                        'ResourceType': 'TestResourceType',
                        'StackId': 'TestFeatureStackId'
                    }
                }

            return None

        def mock_get_stack_name_from_stack_arn_side_effect(stack_arn):
            return stack_arn.replace('Id', 'Name')

        def mock_get_resource_arn_side_effect(stack_arn, resource_type, resource_name):
            return resource_name + 'Arn'

        mock_cf_client = mock.MagicMock()
        mock_cf_client.describe_stack_resources = mock.MagicMock(side_effect=mock_describe_stack_resources_side_effect)
        mock_cf_client.describe_stack_resource = mock.MagicMock(side_effect=mock_describe_stack_resource_side_effect)

        def boto3_client_side_effect(client_type, region_name=None):
            if client_type == 'iam':
                return mock_aim_client
            elif client_type == 'cloudformation':
                return mock_cf_client
            else:
                return None

        expected_data = {}
        expected_physical_id = 'CloudCanvas:PlayerAccess:TestStackName'

        with mock.patch.object(custom_resource_response, 'succeed') as mock_custom_resource_response_succeed:
            with mock.patch.object(boto3, 'client') as mock_boto3_client:
                with mock.patch.object(discovery_utils, 'get_stack_name_from_stack_arn') as mock_get_stack_name_from_stack_arn:
                    with mock.patch.object(discovery_utils, 'get_region_from_stack_arn') as mock_get_region_from_stack_arn:
                        with mock.patch.object(discovery_utils, 'get_account_id_from_stack_arn') as mock_get_account_id_from_stack_arn:
                            with mock.patch.object(discovery_utils, 'get_resource_arn') as mock_get_resource_arn:
                                mock_get_stack_name_from_stack_arn.side_effect = mock_get_stack_name_from_stack_arn_side_effect
                                mock_get_region_from_stack_arn.return_value = 'TestRegion'
                                mock_get_account_id_from_stack_arn.return_value = 'TestAccount'
                                mock_get_resource_arn.side_effect = mock_get_resource_arn_side_effect

                                mock_boto3_client.side_effect = boto3_client_side_effect
            
                                reload(player_access)
                                player_access.handler(self.event, self.context)
            
                                if not with_access_stack:
                                    self.assertEquals(mock_put_role_policy.call_count, 0)
                                else:
                                    self.assertEquals(mock_put_role_policy.call_count, 1)
                                    mock_put_role_policy_kwargs = mock_put_role_policy.call_args[1]

                                    self.assertEquals(mock_put_role_policy_kwargs['RoleName'], 'PlayerResourceId')
                                    self.assertEquals(mock_put_role_policy_kwargs['PolicyName'], 'TestFeatureStackName')

                                    policy_document_string = mock_put_role_policy_kwargs['PolicyDocument']
                                    self.assertTrue(isinstance(policy_document_string, basestring))
                                    policy_document = json.loads(policy_document_string)   
            
                                    expected_policy_document = {
                                        u'Version': u'2012-10-17',
                                        u'Statement': [
                                            {
                                                u'Sid': u'PlayerAccessibleResourceName1Access',
                                                u'Effect': u'Allow',
                                                u'Action': [ u'TestAction1' ],
                                                u'Resource': u'PlayerAccessibleResourceId1Arn'
                                            },
                                            {
                                                u'Sid': u'PlayerAccessibleResourceName2Access',
                                                u'Effect': u'Allow',
                                                u'Action': [ u'TestAction2A', u'TestAction2B' ],
                                                u'Resource': u'PlayerAccessibleResourceId2Arn'
                                            }
                                        ]
                                    }
             
                                    self.maxDiff = None
                                    self.assertEquals(expected_policy_document, policy_document)        

                                mock_custom_resource_response_succeed.assert_called_once_with(
                                    self.event, 
                                    self.context, 
                                    expected_data, 
                                    expected_physical_id)



    def test_handler_with_feature_stack_delete(self):

        self.properties['FeatureStack'] = 'TestFeatureStackId'
        self.event['RequestType'] = 'Delete'

        mock_aim_client = mock.MagicMock()
        mock_delete_role_policy = mock.MagicMock(return_value={})
        mock_aim_client.delete_role_policy = mock_delete_role_policy

        def mock_describe_stack_resources_side_effect(PhysicalResourceId=None, StackName=None):
           
            if PhysicalResourceId == 'TestFeatureStackId' or StackName == 'TestDeploymentStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'TestFeatureStackId',
                            'LogicalResourceId': 'TestFeatureStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        }
                    ]
                }

            if PhysicalResourceId == 'TestDeploymentStackId' or StackName == 'TestProjectStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'TestDeploymentStackId',
                            'LogicalResourceId': 'TestDeploymentStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        },                
                        {                    
                            'PhysicalResourceId': 'TestDeploymentAccessStackId',
                            'LogicalResourceId': 'TestDeploymentStackNameAccess',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        }
                    ]
                }

            if StackName == 'TestDeploymentAccessStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'PlayerResourceId',
                            'LogicalResourceId': 'Player',
                            'ResourceType': 'AWS::IAM::Role',
                            'StackId': 'TestDeploymentAccessStackId'
                        }
                    ]
                }

            return None

        def mock_get_stack_name_from_stack_arn_side_effect(stack_arn):
            return stack_arn.replace('Id', 'Name')

        mock_cf_client = mock.MagicMock()
        mock_cf_client.describe_stack_resources = mock.MagicMock(side_effect=mock_describe_stack_resources_side_effect)

        def boto3_client_side_effect(client_type, region_name=None):
            if client_type == 'iam':
                return mock_aim_client
            elif client_type == 'cloudformation':
                return mock_cf_client
            else:
                return None

        expected_data = {}
        expected_physical_id = 'CloudCanvas:PlayerAccess:TestStackName'

        with mock.patch.object(custom_resource_response, 'succeed') as mock_custom_resource_response_succeed:
            with mock.patch.object(boto3, 'client') as mock_boto3_client:
                with mock.patch.object(discovery_utils, 'get_stack_name_from_stack_arn') as mock_get_stack_name_from_stack_arn:
                    with mock.patch.object(discovery_utils, 'get_region_from_stack_arn') as mock_get_region_from_stack_arn:
                        with mock.patch.object(discovery_utils, 'get_account_id_from_stack_arn') as mock_get_account_id_from_stack_arn:
                            mock_get_stack_name_from_stack_arn.side_effect = mock_get_stack_name_from_stack_arn_side_effect
                            mock_get_region_from_stack_arn.return_value = 'TestRegion'
                            mock_get_account_id_from_stack_arn.return_value = 'TestAccount'

                            mock_boto3_client.side_effect = boto3_client_side_effect
            
                            reload(player_access)
                            player_access.handler(self.event, self.context)

                            mock_delete_role_policy.assert_called_once_with(RoleName='PlayerResourceId', PolicyName='TestFeatureStackName')

                            mock_custom_resource_response_succeed.assert_called_once_with(
                                self.event, 
                                self.context, 
                                expected_data, 
                                expected_physical_id)


    def test_handler_with_feature_stack_delete_without_role(self):

        self.properties['FeatureStack'] = 'TestFeatureStackId'
        self.event['RequestType'] = 'Delete'

        mock_aim_client = mock.MagicMock()
        mock_delete_role_policy = mock.MagicMock(return_value={})
        mock_aim_client.delete_role_policy = mock_delete_role_policy

        def mock_describe_stack_resources_side_effect(PhysicalResourceId=None, StackName=None):
           
            if PhysicalResourceId == 'TestFeatureStackId' or StackName == 'TestDeploymentStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'TestFeatureStackId',
                            'LogicalResourceId': 'TestFeatureStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        }
                    ]
                }

            if PhysicalResourceId == 'TestDeploymentStackId' or StackName == 'TestProjectStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'TestDeploymentStackId',
                            'LogicalResourceId': 'TestDeploymentStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        }
                    ]
                }

            return None

        def mock_get_stack_name_from_stack_arn_side_effect(stack_arn):
            return stack_arn.replace('Id', 'Name')

        mock_cf_client = mock.MagicMock()
        mock_cf_client.describe_stack_resources = mock.MagicMock(side_effect=mock_describe_stack_resources_side_effect)

        def boto3_client_side_effect(client_type, region_name=None):
            if client_type == 'iam':
                return mock_aim_client
            elif client_type == 'cloudformation':
                return mock_cf_client
            else:
                return None

        expected_data = {}
        expected_physical_id = 'CloudCanvas:PlayerAccess:TestStackName'

        with mock.patch.object(custom_resource_response, 'succeed') as mock_custom_resource_response_succeed:
            with mock.patch.object(boto3, 'client') as mock_boto3_client:
                with mock.patch.object(discovery_utils, 'get_stack_name_from_stack_arn') as mock_get_stack_name_from_stack_arn:
                    with mock.patch.object(discovery_utils, 'get_region_from_stack_arn') as mock_get_region_from_stack_arn:
                        with mock.patch.object(discovery_utils, 'get_account_id_from_stack_arn') as mock_get_account_id_from_stack_arn:
                            mock_get_stack_name_from_stack_arn.side_effect = mock_get_stack_name_from_stack_arn_side_effect
                            mock_get_region_from_stack_arn.return_value = 'TestRegion'
                            mock_get_account_id_from_stack_arn.return_value = 'TestAccount'

                            mock_boto3_client.side_effect = boto3_client_side_effect
            
                            reload(player_access)
                            player_access.handler(self.event, self.context)

                            self.assertEquals(0, mock_delete_role_policy.called)

                            mock_custom_resource_response_succeed.assert_called_once_with(
                                self.event, 
                                self.context, 
                                expected_data, 
                                expected_physical_id)


    def test_handler_with_feature_stack_delete_with_role_deleted(self):

        self.properties['FeatureStack'] = 'TestFeatureStackId'
        self.event['RequestType'] = 'Delete'

        def mock_delete_role_policy_side_effect(RoleName=None, PolicyName=None):
            raise ClientError({ "Error": { "Code": "AccessDenied" } }, 'DeleteRolePolicy')

        mock_aim_client = mock.MagicMock()
        mock_delete_role_policy = mock.MagicMock(return_value={})
        mock_delete_role_policy.side_effect = mock_delete_role_policy_side_effect
        mock_aim_client.delete_role_policy = mock_delete_role_policy

        def mock_describe_stack_resources_side_effect(PhysicalResourceId=None, StackName=None):
           
            if PhysicalResourceId == 'TestFeatureStackId' or StackName == 'TestDeploymentStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'TestFeatureStackId',
                            'LogicalResourceId': 'TestFeatureStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        }
                    ]
                }

            if PhysicalResourceId == 'TestDeploymentStackId' or StackName == 'TestProjectStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'TestDeploymentStackId',
                            'LogicalResourceId': 'TestDeploymentStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        },                
                        {                    
                            'PhysicalResourceId': 'TestDeploymentAccessStackId',
                            'LogicalResourceId': 'TestDeploymentStackNameAccess',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        }
                    ]
                }

            if StackName == 'TestDeploymentAccessStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'PlayerResourceId',
                            'LogicalResourceId': 'Player',
                            'ResourceType': 'AWS::IAM::Role',
                            'StackId': 'TestDeploymentAccessStackId'
                        }
                    ]
                }

            return None

        def mock_get_stack_name_from_stack_arn_side_effect(stack_arn):
            return stack_arn.replace('Id', 'Name')

        mock_cf_client = mock.MagicMock()
        mock_cf_client.describe_stack_resources = mock.MagicMock(side_effect=mock_describe_stack_resources_side_effect)

        def boto3_client_side_effect(client_type, region_name=None):
            if client_type == 'iam':
                return mock_aim_client
            elif client_type == 'cloudformation':
                return mock_cf_client
            else:
                return None

        expected_data = {}
        expected_physical_id = 'CloudCanvas:PlayerAccess:TestStackName'

        with mock.patch.object(custom_resource_response, 'succeed') as mock_custom_resource_response_succeed:
            with mock.patch.object(boto3, 'client') as mock_boto3_client:
                with mock.patch.object(discovery_utils, 'get_stack_name_from_stack_arn') as mock_get_stack_name_from_stack_arn:
                    with mock.patch.object(discovery_utils, 'get_region_from_stack_arn') as mock_get_region_from_stack_arn:
                        with mock.patch.object(discovery_utils, 'get_account_id_from_stack_arn') as mock_get_account_id_from_stack_arn:
                            mock_get_stack_name_from_stack_arn.side_effect = mock_get_stack_name_from_stack_arn_side_effect
                            mock_get_region_from_stack_arn.return_value = 'TestRegion'
                            mock_get_account_id_from_stack_arn.return_value = 'TestAccount'

                            mock_boto3_client.side_effect = boto3_client_side_effect
            
                            reload(player_access)
                            player_access.handler(self.event, self.context)

                            mock_delete_role_policy.assert_called_once_with(RoleName='PlayerResourceId', PolicyName='TestFeatureStackName')

                            mock_custom_resource_response_succeed.assert_called_once_with(
                                self.event, 
                                self.context, 
                                expected_data, 
                                expected_physical_id)

    def test_handler_with_deployment_stack(self):

        self.properties['DeploymentStack'] = 'TestDeploymentStackId'
        self.event['RequestType'] = 'TestRequestType'

        def mock_describe_stack_resources_side_effect(PhysicalResourceId=None, StackName=None):
           
            if StackName == 'TestDeploymentStackId':
                return {
                    'StackResources': [
                        {
                            'PhysicalResourceId': 'TestFeatureStackId1',
                            'LogicalResourceId': 'TestFeatureStackName1',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        },
                        {
                            'PhysicalResourceId': 'TestFeatureStackId2',
                            'LogicalResourceId': 'TestFeatureStackName2',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestDeploymentStackId'
                        },
                        {
                            'PhysicalResourceId': 'OtherId',
                            'LogicalResourceId': 'OtherName',
                            'ResourceType': 'OtherType',
                            'StackId': 'TestDeploymentStackId'
                        }
                    ]
                }

            if PhysicalResourceId == 'TestDeploymentStackId' or StackName == 'TestProjectStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'TestDeploymentStackId',
                            'LogicalResourceId': 'TestDeploymentStackName',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        },                
                        {                    
                            'PhysicalResourceId': 'TestDeploymentAccessStackId',
                            'LogicalResourceId': 'TestDeploymentStackNameAccess',
                            'ResourceType': 'AWS::CloudFormation::Stack',
                            'StackId': 'TestProjectStackId'
                        }
                    ]
                }

            if StackName == 'TestDeploymentAccessStackId':
                return {
                    'StackResources': [
                        {                    
                            'PhysicalResourceId': 'PlayerResourceId',
                            'LogicalResourceId': 'Player',
                            'ResourceType': 'AWS::IAM::Role',
                            'StackId': 'TestDeploymentAccessStackId'
                        }
                    ]
                }

            return None

        def mock_get_stack_name_from_stack_arn_side_effect(stack_arn):
            return stack_arn.replace('Id', 'Name')

        mock_cf_client = mock.MagicMock()
        mock_cf_client.describe_stack_resources = mock.MagicMock(side_effect=mock_describe_stack_resources_side_effect)

        def boto3_client_side_effect(client_type, region_name=None):
            if client_type == 'cloudformation':
                return mock_cf_client
            else:
                return None

        expected_data = {}
        expected_physical_id = 'CloudCanvas:PlayerAccess:TestStackName'

        with mock.patch.object(custom_resource_response, 'succeed') as mock_custom_resource_response_succeed:
            with mock.patch.object(boto3, 'client') as mock_boto3_client:
                with mock.patch.object(discovery_utils, 'get_stack_name_from_stack_arn') as mock_get_stack_name_from_stack_arn:
                    with mock.patch.object(discovery_utils, 'get_region_from_stack_arn') as mock_get_region_from_stack_arn:
                        with mock.patch.object(discovery_utils, 'get_account_id_from_stack_arn') as mock_get_account_id_from_stack_arn:

                            mock_get_stack_name_from_stack_arn.side_effect = mock_get_stack_name_from_stack_arn_side_effect
                            mock_get_region_from_stack_arn.return_value = 'TestRegion'
                            mock_get_account_id_from_stack_arn.return_value = 'TestAccount'

                            mock_boto3_client.side_effect = boto3_client_side_effect
            
                            reload(player_access)
                            
                            with mock.patch.object(player_access, '_process_feature_stack') as mock_process_feature_stack:

                                player_access.handler(self.event, self.context)
                                
                                self.assertEquals(mock_process_feature_stack.call_count, 2)
                                mock_process_feature_stack.assert_any_call('TestRequestType', FeatureInfoForFeature('TestFeatureStackName1'), 'PlayerResourceId')
                                mock_process_feature_stack.assert_any_call('TestRequestType', FeatureInfoForFeature('TestFeatureStackName2'), 'PlayerResourceId')

                                mock_custom_resource_response_succeed.assert_called_once_with(
                                    self.event, 
                                    self.context, 
                                    expected_data, 
                                    expected_physical_id)

class FeatureInfoForFeature(object):
     
    def __init__(self, feature_name):
        self.feature_name = feature_name

    def __repr__(self):
        return 'FeatureInfoForFeature(feature_name="{}")'.format(self.feature_name)

    def __eq__(self, other):
        return other.feature_name == self.feature_name
