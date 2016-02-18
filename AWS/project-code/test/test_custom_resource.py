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
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/test/test_custom_resource.py#3 $

import unittest
import mock

from .. import deployment_configuration
from .. import feature_configuration
from .. import player_access
from .. import custom_resource
from .. import lambda_configuration

class TestCustomResource(unittest.TestCase):

    def test_handler_dispatches_DeploymentConfiguration(self):
        
        event = {
            'ResourceType': 'Custom::DeploymentConfiguration'
        }

        context = {
        }

        with mock.patch.object(deployment_configuration, 'handler') as mock_handler:
            reload(custom_resource) # so dispatch table points to mock
            custom_resource.handler(event, context)
            mock_handler.assert_called_with(event, context)


    def test_handler_dispatches_FeatureConfiguration(self):
        
        event = {
            'ResourceType': 'Custom::FeatureConfiguration'
        }

        context = {
        }

        with mock.patch.object(feature_configuration, 'handler') as mock_handler:
            reload(custom_resource) # so dispatch table points to mock
            custom_resource.handler(event, context)
            mock_handler.assert_called_with(event, context)


    def test_handler_dispatches_PlayerAccess(self):
        
        event = {
            'ResourceType': 'Custom::PlayerAccess'
        }

        context = {
        }

        with mock.patch.object(player_access, 'handler') as mock_handler:
            reload(custom_resource) # so dispatch table points to mock
            custom_resource.handler(event, context)
            mock_handler.assert_called_with(event, context)

    def test_handler_dispatches_LambdaConfiguration(self):
        
        event = {
            'ResourceType': 'Custom::LambdaConfiguration'
        }

        context = {
        }

        with mock.patch.object(lambda_configuration, 'handler') as mock_handler:
            reload(custom_resource) # so dispatch table points to mock
            custom_resource.handler(event, context)
            mock_handler.assert_called_with(event, context)

