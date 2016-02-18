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
var s3 = new aws.S3();
var dynamo = new aws.DynamoDB.DocumentClient();
var util = require('../util/util.js');
var async = require('async');
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");
var kGameContextFlags = require("../gamecontext.js").kGameContextFlags;

var kAchievementTable = cloudCanvasSettings.AchievementsTable;

var achievements;

exports.systemName = "achievements";
exports.requiredFlags = kGameContextFlags.updatePlayer;

exports.Init = function (gameContext, callback) {
    return this._Load(gameContext, callback);
};

exports._Load = function (gameContext, callback) {
    //If achievements isn't loaded yet, kick off a scan
    if (!achievements) {
        console.log("Loading achievement definitions...");
        dynamo.scan({ TableName : kAchievementTable }, function (err, data) {
            
            if (err != null) {
                return callback(err, gameContext);
            }
            
            achievements = data.Items;
        });
    }
    _waitForLoad(gameContext, callback);
};

exports.Finish = function (gameContext, callback) {
    
    var tasks = [];
    achievements.forEach(function (achievement) {
        tasks.push(function (callback) {
            grantAchievementIfCriteriaMet(achievement, gameContext, callback);
        })
    });
    
    
    async.parallel(tasks, function (err) {
        callback(err, gameContext);
    });
};

var grantAchievementIfCriteriaMet = function (achievement, gameContext, callback) {
    
    //Pull player into the local context so we can use it in our achievement evaluations
    var player = gameContext.systems.player.fields._fields;
    var grantAchievement;
    try {
        grantAchievement = eval(achievement.CompletionCriteria);
    }
    catch (e) {
        return callback(null, gameContext);
    }
    
    //Only grant the achievement if the player doesn't already ahve it
    if (grantAchievement && player.Achievements.values.indexOf(achievement.Name) == -1) {
        console.log("Granting achievement: " + achievement.Name);
        gameContext.systems.player.fields.AddToSetAchievements(achievement.Name);
        //Grant them their award if there is one
        if (achievement.ItemReward) {
            gameContext.systems.player.AddToInventory(gameContext, achievement.ItemReward, callback);
        }
        else {
            callback(null, gameContext);
        }
    }
    else {
        callback(null, gameContext);
    }
};



var _waitForLoad = function (gameContext, callback) {
    if (achievements) {
        return callback(null, gameContext);
    }
    
    //if we're still waiting on achievements, push a timer to call this function again
    setTimeout(_waitForLoad, 10, gameContext, callback);
};
