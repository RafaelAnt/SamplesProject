/*
*  All or portions of this file Copyright (c) Amazon.com, Inc. or its affiliates or
*  its licensors.
*
* For complete copyright and license terms please see the LICENSE at the root of this
* distribution (the "License"). All use of this software is governed by the License,
* or, if provided, by the license below or the license accompanying this file. Do not
* remove or modify any license notices. This file is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
*
*/
exports.identity = { cognitoIdentityId: "TestPlayer" }

exports.fail = function (err) {
    if (err != null) {
        console.log("Error:\n" + err);
    }
}

exports.succeed = function (data) {
    
    var logOutput = "Lambda completed successfully!";
    
    if (data != null) {
        logOutput += "  Data returned:\n";
        logOutput += JSON.stringify(data, null, 4);
    }
    
    console.log(logOutput);
}