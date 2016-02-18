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
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/custom_resource.py#6 $

import feature_configuration
import deployment_configuration
import custom_resource_response
import player_access
import lambda_configuration
import cognito_identity_pool
import traceback
import populate_tables

from properties import ValidationError

handlers = {
    'Custom::DeploymentConfiguration': deployment_configuration.handler,
    'Custom::FeatureConfiguration': feature_configuration.handler,
    'Custom::PlayerAccess': player_access.handler,
    'Custom::LambdaConfiguration'  : lambda_configuration.handler,
    'Custom::CognitoIdentityPool' : cognito_identity_pool.handler,
    'Custom::PopulateTables' : populate_tables.handler
}

def unknown_handler(event, context):
    custom_resource_response.fail(event, context, 'Unknown resource type {}'.format(event['ResourceType']))

def handler(event, context):
    try:
        handler = handlers.get(event['ResourceType'], unknown_handler)   
        handler(event, context)
    except ValidationError as e:
        custom_resource_response.fail(event, context, str(e))
    except Exception as e:
        print 'Unexpected error occured when processing event {} with context {}. {}'.format(event, context, traceback.format_exc())
        custom_resource_response.fail(event, context, 'Unexpected error occured. Details can be found in the CloudWatch log group {} stream {}'.format(
            context.log_group_name,
            context.log_stream_name))

