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
var aws = require('aws-sdk');
aws.config.update({ logger : process.stdout });

var dynamo = new aws.DynamoDB.DocumentClient();

var kPacificTimeZoneOffset = -8;
var kTimeZoneOffset = kPacificTimeZoneOffset;

exports.GetCorrectedDate = function (includeTime) {
    
    var todaysDate = new Date();
    todaysDate = new Date(todaysDate.getUTCFullYear(), 
                          todaysDate.getUTCMonth(), 
                          todaysDate.getUTCDate(),
                          todaysDate.getUTCHours(),
                          todaysDate.getUTCMinutes(),
                          todaysDate.getUTCSeconds());
    
    todaysDate.setHours(todaysDate.getHours() + kTimeZoneOffset);
    
    if (includeTime == false) {
        todaysDate.setHours(0);
        todaysDate.setMinutes(0);
        todaysDate.setSeconds(0);
    }

    return todaysDate;
}

exports.GetFormattedDate = function (includeTime) {

    var currentDate = this.GetCorrectedDate(includeTime);
    var day = currentDate.getDate();
    var month = currentDate.getMonth() + 1;
    var year = currentDate.getFullYear();
    var result = '';
    
    if (day < 10) {
        day = '0' + day;
    }
    
    if (month < 10) {
        month = '0' + month;
    }
    
    var result = month + '-' + day + '-' + year;
    
    if (includeTime) {
        var hours = currentDate.getHours();
        var mins = currentDate.getMinutes();
        var secs = currentDate.getSeconds(); 

        if (hours < 10) {
            hours = '0' + hours;
        }
        
        if (mins < 10) {
            mins = '0' + mins;
        }
        
        if (secs < 10) {
            secs = '0' + secs;
        }

        result += ' ' + hours + ':' + mins + ':' + secs;
    }

    return result;
};

exports.GetElapsedTimeInSeconds = function (startTime, endTime) {
    var currentTime = new Date(endTime);
    var oldTime = new Date(startTime);
    var elapsed = currentTime - oldTime;
    
    return elapsed / 1000;
};

exports.GetElapsedTimeInMinutes = function (startTime, endTime) {
    return this.GetElapsedTimeInSeconds(startTime,endTime) / 60;
};

exports.GetDynamoItem = function(gameContext, tableName, keyName, keyValue, attributes, callback)
{
    if (gameContext.getDynamoItemCache == null) {
        gameContext.getDynamoItemCache = {};
    }
    else {
        var tableCache = gameContext.getDynamoItemCache[tableName];

        if(tableCache != null)
        {
            var item = tableCache[keyValue];
            
            if (item != null) {
                return callback(null, gameContext, item);
            }
        }
    }

    var getItem = {};
    getItem.TableName = tableName;
    getItem.Key = {};
    getItem.Key[keyName] = keyValue;
    getItem.AttributesToGet = attributes;
        
    dynamo.get(getItem, function (err, data) {
        if (err) {
            console.log(err);
            callback(err, gameContext);
            return;
        }
        
        var tableCache = gameContext.getDynamoItemCache[tableName];
        
        if (tableCache == null) {
            tableCache = {};
            gameContext.getDynamoItemCache[tableName] = tableCache;
        }
        
        tableCache[keyValue] = data.Item;

        callback(null, gameContext, data.Item);
    });
}