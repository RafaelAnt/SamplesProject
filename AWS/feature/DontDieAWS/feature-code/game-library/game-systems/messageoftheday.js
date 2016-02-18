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
var async = require("async");
var util = require("../util/util.js");
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kMessageOfTheDayTable = cloudCanvasSettings.MessageOfTheDayTable;
var kMessageOfTheDayTableHashKey = "Date";
var kMessageOfTheDayFields = ['Message'];
var kMessageOfTheDayCachedItemName = "TodaysMessage";

exports.systemName = "messageOfTheDay";

exports.OnRegister = function (dontDie) {
    
    dontDie.RegisterConstant(this, "kTable", kMessageOfTheDayTable);
    dontDie.RegisterConstant(this, "kTableKeyName", kMessageOfTheDayTableHashKey);
    dontDie.RegisterConstant(this, "kCachedItemName", kMessageOfTheDayCachedItemName);

    dontDie.RegisterCommand("getMessageOfTheDay", 0, function (gameContext, event, callback) {
        gameContext.systems.messageOfTheDay.TryToGetMessageOfTheDay(gameContext, callback);
    });
}

exports.Init = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.TryToGetMessageOfTheDay = function (gameContext, callback) {
    var messageOfTheDay = this;

    async.waterfall(
    [
        function (callback) {
            messageOfTheDay.GetTodaysMessage(gameContext, callback);
        },

        function (gameContext, messageData, callback) {
            if (messageData == null) {
                callback(null, gameContext);
            } else {
                var messageOfTheDayData = {
                    message: messageData.Message
                };
                gameContext.output.messageOfTheDay = messageOfTheDayData;
                callback(null, gameContext);
            }           
            return;
        }
    ],

    callback);
};

exports.GetTodaysMessage = function (gameContext, callback) {
    gameContext.systems.gameDataLUTable.GetCachedItem(gameContext, kMessageOfTheDayCachedItemName, callback);
}

exports.Finish = function (gameContext, callback) {
    callback(null, gameContext);
}