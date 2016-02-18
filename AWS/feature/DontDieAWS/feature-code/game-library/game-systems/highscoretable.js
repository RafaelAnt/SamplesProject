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

var s3 = new aws.S3();
var dynamo = new aws.DynamoDB.DocumentClient();
var util = require('../util/util.js');
var async = require('async');
var kGameContextFlags = require("../gamecontext.js").kGameContextFlags;
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var kMaxHighScores = 10;
var kScoreTable = cloudCanvasSettings.ScoreTable;
var kS3Bucket = cloudCanvasSettings.MainBucket;
var kS3Key = "highscores";

exports.systemName = "highScoreTable";
exports.requiredFlags = kGameContextFlags.loadHighScoreTable;
exports.methodRequiredFlags = 
{
    "RecordScore" : kGameContextFlags.updatePlayer
};

exports.OnRegister = function (dontDie) {
    dontDie.RegisterCommand("getHighScoreTable", kGameContextFlags.loadHighScoreTable, function (gameContext, event, callback) {
        gameContext.systems.highScoreTable.OutputToClient(gameContext, callback);
    });
}

exports.Init = function (gameContext, callback) {
    this.dirty = false;
    this.outputToClient = false;
    this.highScores = {};
    this._Load(gameContext, callback);
};

exports.OutputToClient = function (gameContext, callback) {
    this.outputToClient = true;
    callback(null, gameContext);
}

exports._Load = function (gameContext, callback) {
    var getHighscoreRequest = {};
    getHighscoreRequest.Bucket = kS3Bucket;
    getHighscoreRequest.Key = kS3Key;
        
    var highScoreTable = this;

    s3.getObject(getHighscoreRequest, function (err, data) {
        if (err) {
            if (err.code == "NoSuchKey") {
                console.log("Highscore file does not exist in S3. Creating...");
                highScoreTable.highScores.scores = [];
            }
            else {
                console.log("Could not retrieve highscore list");
                callback(err, gameContext);
                return;
            }
        }
        else {
            highScoreTable.highScores = JSON.parse(data.Body);
        }
            
        callback(null, gameContext);
    });
}; 

exports.RecordScore = function (gameContext, score, callback) {
        
    var player = gameContext.systems.player;
    var timestamp = this._GetTimeStamp();
        
    var setScore = {};
    setScore.TableName = kScoreTable;
    setScore.Key = { "playerId" : player.playerId, "timestamp": timestamp };
    setScore.UpdateExpression = "set Score = :scoreValue";
    setScore.ExpressionAttributeValues = { ":scoreValue" : score.toString() };
    setScore.ReturnValues = "NONE";
        
    var highScoreTable = this;

    dynamo.update(setScore, function (err, data) {
        if (err != null) {
            console.log("Could not update scores");
            console.log(err);
            callback(err, gameContext, false);
            return;
        }
            
        highScoreTable._AddToHighscores(gameContext, score, timestamp, callback);
    });
};
    
exports._GetTimeStamp = function (date) {
    var d = date == null ? util.GetFormattedDate(true) : date;
    return d.replace(/:| |-/g, '').toString();
};

exports._AddToHighscores = function (gameContext, score, timestamp, callback) {
    
    var player = gameContext.systems.player;

    if (!player.fields.UsernameIsDirtyOrLoaded()) {
        callback("Username not set", gameContext);
        return;
    }

    if (this.highScores.scores.length >= kMaxHighScores) {
            
        var lowestScore = this.highScores.scores.slice(-1)[0].Score;
            
        if (score <= lowestScore) {
            callback(null, gameContext, false);
            return;
        }
        else {
            this.highScores.scores.pop();
        }
    }
        
    var scoreRecord = {};
    scoreRecord.Score = score;
    scoreRecord.Username = player.fields.GetUsername();
    scoreRecord.Timestamp = timestamp;
        
    this.highScores.scores.push(scoreRecord);
    this.highScores.scores.sort(function (scoreRecordA, scoreRecordB) { return scoreRecordB.Score - scoreRecordA.Score });
    this.dirty = true;

    callback(null, gameContext, true);
};

exports.Finish = function (gameContext, callback) {

    var tasks = [ 
        function (callback) 
        {
            callback(null, gameContext);
        }
    ];
    
    var player = gameContext.systems.player; 

    if (player != null && player.GameJustEnded()) {
        tasks.push(function (gameContext,callback) {
            var highScoreTable = gameContext.systems.highScoreTable;
            
            if (!player.fields.StartGameTimeIsDirtyOrLoaded()) {
                callback("StartGameTime not set", gameContext);
                return;
            }

            var score = util.GetElapsedTimeInSeconds(player.fields.GetStartGameTime(), player.fields.GetEndGameTime());
            player.fields.AddToTotalScore(score);
            player.fields.SetLastScore(score);
            highScoreTable.RecordScore(gameContext, score, function (err, gameContext, addedToHighScoreTable) {
                
                if (err != null) {
                    callback(err, gameContext);
                    return;
                }
                else {
                    var endGameInfo = gameContext.output.player.endGameInfo;
                    endGameInfo.score = score;
                    endGameInfo.madeHighScoreTable = addedToHighScoreTable.toString();
                    endGameInfo.endGameTime = player.fields.GetEndGameTime();
                    endGameInfo.timeStamp = highScoreTable._GetTimeStamp();
                    callback(null, gameContext);
                    return;
                }
  
            });
        });
    }
    
    var highScoreTable = this;
   
    tasks.push(function (gameContext, callback) {
        
        if (!highScoreTable.dirty) {
            callback(null, gameContext);
            return;
        }
        
        var setHighscoreRequest = {};
        setHighscoreRequest.Bucket = kS3Bucket;
        setHighscoreRequest.Key = kS3Key;
        setHighscoreRequest.Body = JSON.stringify(highScoreTable.highScores, null, 4);
        
        /*
        TODO: As Preston pointed out:
  
        There is a race condition here.
        Say there are 2 players submitting high scores and this ordering hapens:

        Player1's lambda reads high score object
        Player2's lambda reads high score object
        Player1's lambda writes high score object
        Player2's lambda writes high score object

        Now player 1's high score is gone.

        */ 

        s3.upload(setHighscoreRequest, function (err, data) {
            if (err) {
                console.log("Could not save highscore list");
                callback(err, gameContext);
                return;
            }
            else {
                highScoreTable.dirty = false;
                callback(null, gameContext);
                return;
            }
        });
    });
    
    if (this.outputToClient) {
        tasks.push(function (gameContext, callback) {
            gameContext.output.highScoreTable = highScoreTable.highScores;
            callback(null, gameContext);
        });
    }

    async.waterfall(tasks, callback);
};