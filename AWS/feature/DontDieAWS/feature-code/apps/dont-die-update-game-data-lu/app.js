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
var dontDie = require("../../game-library/dontdie.js");

dontDie.Init();

exports.handler = function (event, context) {
    
    console.log("Event payload: ");
    console.log(JSON.stringify(event, null, 4));

    dontDie.CreateGameContext(context, 0, 0, function (err, gameContext) {
        
        var todaysDate = dontDie.util.GetCorrectedDate(false);

        var CompareDates = function (currentItem, newItem) {
            
            var newDate = new Date(newItem.Date);
            var newEndDate = newDate;
            
            if (newItem.EndDate != null) {

                if (newItem.EndDate == "infinity") {
                    newEndDate = new Date();
                    newEndDate.setDate(todaysDate.getDate() + 1);
                }
                else if (newItem.EndDate == "") {
                    newEndDate = newDate;
                }
                else {
                    newEndDate = new Date(newItem.EndDate);
                }
            }
           

            if (todaysDate < newDate || todaysDate > newEndDate) {
                return false;
            }
            
            if (currentItem == null) {
                return true;
            }
            
            var currentDate = new Date(currentItem.Date);
            var currentEndDate = new Date(currentItem.EndDate);
            
            if (newDate > currentDate && todaysDate >= newDate && todaysDate <= newEndDate) {
                return true;
            }
            else {
                return false;
            }
        };
        
        var itemUpdates = ('Records' in event) ? event.Records : null; 
        var dailyGift = gameContext.systems.dailyGift;
        var messageOfTheDay = gameContext.systems.messageOfTheDay;
        var gameDataLUTable = gameContext.systems.gameDataLUTable;
        
        var systemConstants = dontDie.systemConstants;

        async.waterfall([

            function (callback) {
                gameDataLUTable.UpdateCachedItem(gameContext, 
                                                 systemConstants.dailyGift.kTable, 
                                                 systemConstants.dailyGift.kTableKeyName,
                                                 systemConstants.dailyGift.kCachedItemName,
                                                 itemUpdates,
                                                 CompareDates,
                                                 callback);
            },

            function (gameContext, callback) {
                gameDataLUTable.UpdateCachedItem(gameContext, 
                                                 systemConstants.messageOfTheDay.kTable, 
                                                 systemConstants.messageOfTheDay.kTableKeyName,
                                                 systemConstants.messageOfTheDay.kCachedItemName,
                                                 itemUpdates,
                                                 CompareDates,
                                                 callback);
            }
        ],

        dontDie.FinishGameContext);
    });
};
