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
var kGameContextFlags = require("../gamecontext.js").kGameContextFlags;
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kMissionTable = cloudCanvasSettings.MissionTable;
var kMissionTableHashKey = "Name";
var kMissionFields = ['NumberOfGamesReq', 'Description', 'CompletionText', 'ItemReward'];

exports.systemName = "missionManager";
exports.requiredFlags = kGameContextFlags.updatePlayer;

exports.Init = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.StartMission = function (gameContext, missionId, callback) {

    if ( gameContext.systems.player.HasActiveMission()) {
        callback("AlreadyHasMission", gameContext);
        return;
    }
        
    var missionManager = this;

    async.waterfall([
        function (callback) {
            missionManager.GetMission(gameContext, missionId, callback);
        },

        function (gameContext, missionData, callback) {
            if (missionData == null) {
                callback("MissionNotFound");
                return;
            }

            var activeMission = {
                "MissionId" : missionId,
                "NumGamesCompleted" : 0
            };
            
            gameContext.output.player.mission = {
                status : "Start",
                missionData : missionData,
                activeMissionData : activeMission
            };

            gameContext.systems.player.fields.SetActiveMission(activeMission);
                
            callback(null,gameContext);
        }
    ],

    callback);

};

exports.UpdateActiveMission = function (gameContext, callback) {
    
    var player = gameContext.systems.player;

    if (!player.fields.ActiveMissionIsDirtyOrLoaded() || !player.HasActiveMission()) {
        callback(null, gameContext);
        return;
    }

    var missionManager = this;
    var activeMission = player.fields.GetActiveMission();

    if (player.GameJustEnded()) {
        ++activeMission.NumGamesCompleted;
        player.fields.SetActiveMission(activeMission);
    }

    async.waterfall([
        function (callback) {
            missionManager.GetMission(gameContext, activeMission.MissionId, callback);
        },

        function (gameContext, missionData, callback) {
                
            if (missionManager._IsMissionCriteriaMet(player, missionData)) {
                missionManager.CompleteMission(gameContext, missionData, callback);
            }
            else {
                
                if (!("mission" in gameContext.output.player)) {
                    gameContext.output.player.mission = {
                        status : "InProgress",
                        missionData : missionData
                    };
                }

                gameContext.output.player.mission.activeMissionData = activeMission;

                callback(null, gameContext);
            }
        }
    ],

    callback);
};
    
exports._IsMissionCriteriaMet = function (player, missionData) {
        
    var activeMission = player.fields.GetActiveMission();

    return activeMission.NumGamesCompleted >= missionData.NumberOfGamesReq;
};
    
exports.CompleteMission = function (gameContext, missionData, callback) {
    
    var player = gameContext.systems.player;

    gameContext.output.player.mission = {
        status : "Complete",
        missionData : missionData
    };

    async.waterfall([
        function (callback) {
            if (missionData.ItemReward != "") {
                player.AddToInventory(gameContext, missionData.ItemReward, callback);
            }
        },
        function (gameContext, callback) {
            player.fields.SetActiveMission({});
            callback(null, gameContext);
        }
    ],
    
    callback);
};

exports.GetMission = function (gameContext, missionId, callback) {

    util.GetDynamoItem(gameContext, 
                       kMissionTable, 
                       kMissionTableHashKey, 
                       missionId, 
                       kMissionFields, 

    function (err, gameContext, missionData) {
        if (err != null) {
            callback(err, gameContext);
            return;
        }

        callback(null, gameContext, missionData);
    });
};

exports.Finish = function (gameContext, callback) {
    this.UpdateActiveMission(gameContext, callback);
}