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

var async = require('async');
var dynamo = new aws.DynamoDB.DocumentClient();
var util = require("../util/util.js");
var kGameContextFlags = require("../gamecontext.js").kGameContextFlags;
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kPlayerTable = cloudCanvasSettings.PlayerTable;
var kPlayerTableHashKey = "PlayerID";

exports.systemName = "player";
exports.requiredFlags = kGameContextFlags.updatePlayer;

exports.OnRegister = function (dontDie) {

    dontDie.RegisterCommand("startGame" , kGameContextFlags.updatePlayer, function (gameContext, event, callback) {
        if (event.username == null) {
            return callback("Username not specified", gameContext);
        }
        
        gameContext.systems.player.fields.SetUsername(event.username);
        gameContext.systems.player.StartGame(gameContext, callback);
    });

    dontDie.RegisterCommand("endGame" , kGameContextFlags.updatePlayer | kGameContextFlags.loadHighScoreTable, function (gameContext, event, callback) {
        gameContext.systems.player.EndGame(gameContext, callback);
    });
}

exports.HasActiveMission = function () {
    return Object.keys(this.fields.GetActiveMission()).length > 0;
};

exports.Init = function (gameContext, callback) {

    this.dontDie = gameContext.dontDie;
    this.gameContext = gameContext;
    this.playerId = gameContext.playerId;
    this._nonPersistedInventory = [];
    this._gameStarted = false;
    this._gameEnded = false;
    
    this.fields = new (require("../util/fieldmanager.js")).FieldManager();
    this.fields.RegisterField("StartGameTime", "");
    this.fields.RegisterField("EndGameTime", "");
    this.fields.RegisterField("Username", "");
    this.fields.RegisterField("LastDailyGiftTime", "");
    this.fields.RegisterField("Inventory", []);
    this.fields.RegisterField("ActiveMission", {});
    this.fields.RegisterField("TotalScore", 0);
    this.fields.RegisterField("LastScore", 0);
    this.fields.RegisterField("Achievements", dynamo.createSet([]));
    
    gameContext.output.player = {};

    this._Load(callback);
};

exports._Load = function (callback) {
    this.fields.LoadFromDB(this.gameContext, kPlayerTable, kPlayerTableHashKey, this.playerId, callback);
};
    
exports.AddToInventory = function (gameContext, itemName, callback) {

    var player = this;
        
    async.waterfall([
        function (callback) {
            gameContext.systems.itemManager.GetItem(gameContext, itemName, callback);
        },
        function (gameContext, itemData, callback) {
            if (itemData.Persist) {
                var inventory = player.fields.GetInventory();
                inventory.push(itemName);
                player.fields.SetInventory(inventory);
            }
            else {
                player._nonPersistedInventory.push(itemName);
            }
                
            callback(null, gameContext);
        }
    ],
        
    callback
    );
};

exports.Finish = function (gameContext, callback) {
    var updateTasks = [];

    gameContext.output.player.inventory = this.fields.GetInventory().concat(this._nonPersistedInventory);
    
    if (this.fields.HasDirtyFields()) {
        this.fields.SaveToDB(gameContext, kPlayerTable, kPlayerTableHashKey, this.playerId, callback);
        return;
    }
    else {
        callback(null, gameContext);
        return;
    }
};
    
exports.StartGame = function (gameContext, callback) {
    this.fields.SetStartGameTime(this.dontDie.util.GetFormattedDate(true));
    this._gameStarted = true;
    callback(null, gameContext);
};
    
exports.EndGame = function (gameContext, callback) {
    this.fields.SetEndGameTime(this.dontDie.util.GetFormattedDate(true));
    this._gameEnded = true;
    gameContext.output.player.endGameInfo = {};
    callback(null, gameContext);
};
    
exports.GameJustStarted = function () {
    return this._gameStarted;
};
    
exports.GameJustEnded = function () {
    return this._gameEnded;
};