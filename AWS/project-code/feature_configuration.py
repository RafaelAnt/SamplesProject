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
# $Id: //lyengine/branches/AWSIntegration/Tools/lmbr_aws/AWSResourceManager/default-content/project-code/feature_configuration.py#3 $

import properties
import custom_resource_response
import discovery_utils

def handler(event, context):
    
    props = properties.load(event, {
        'ConfigurationBucket': properties.String(),
        'ConfigurationKey': properties.String(),
        'FeatureName': properties.String()})

    data = {
        'ConfigurationBucket': props.ConfigurationBucket,
        'ConfigurationKey': '{}/feature/{}'.format(props.ConfigurationKey, props.FeatureName),
        'TemplateURL': 'https://s3.amazonaws.com/{}/{}/feature/{}/feature-template.json'.format(props.ConfigurationBucket, props.ConfigurationKey, props.FeatureName)
    }

    physical_resource_id = 'CloudCanvas:LambdaConfiguration:{stack_name}:{feature_name}'.format(
        stack_name=discovery_utils.get_stack_name_from_stack_arn(event['StackId']),
        feature_name=props.FeatureName)

    custom_resource_response.succeed(event, context, data, physical_resource_id)
