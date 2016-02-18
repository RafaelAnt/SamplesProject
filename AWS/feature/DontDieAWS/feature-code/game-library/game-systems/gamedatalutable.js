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
var util = require("../util/util.js");
var async = require("async");
var cloudCanvasSettings = require("../../CloudCanvas/settings.js");

var aws = require('aws-sdk');
aws.config.update({ logger : process.stdout });

var dynamoDB = new aws.DynamoDB();
var dynamoDoc = new aws.DynamoDB.DocumentClient();

var kGameDataLUTableName = cloudCanvasSettings.GameDataLUTable;
var kGameDataLUTableKeyName = "CachedItemName";
var kGameDataLUTableFields = ["CachedItem"];

exports.systemName = "gameDataLUTable";

exports.Init = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.Finish = function (gameContext, callback) {
    callback(null, gameContext);
};

exports.GetCachedItem = function (gameContext, itemName, callback) {
    util.GetDynamoItem(gameContext, kGameDataLUTableName, kGameDataLUTableKeyName, itemName, kGameDataLUTableFields, function (err, gameContext, data) {
        if (err != null) {
            callback(err, gameContext);
            return;
        }
        else {
            callback(null, gameContext, data != null ? data.CachedItem : null);
            return;
        }
    });
};

exports.UpdateCachedItem = function (gameContext, tableName, tableKeyName, cachedItemName, itemUpdates, shouldUpdateCallback, doneCallback) {
    
    console.log("Trying to update cached item '" + cachedItemName + "' from table '" + tableName + "' whose key name is '" + tableKeyName + "'");

    if (itemUpdates == null || itemUpdates.length == 0) {
        console.log("No item updates to go off of, so do a full scan of the table...");
        this._ScanTable(gameContext, tableName, cachedItemName, shouldUpdateCallback, doneCallback);
        return;
    }

    var itemUpdate = itemUpdates[ itemUpdates.length - 1 ];

    // If this update has nothing to do with our table, bail
    if (itemUpdate.eventSourceARN.indexOf(tableName) == -1) {
        console.log("Record updates received do not pertain to table in question, bailing on update...");
        doneCallback(null, gameContext);
        return;
    }

    var gameDataLUTable = this;
    
    // Grab the currently cached data out of our look up table
    util.GetDynamoItem(gameContext, kGameDataLUTableName, kGameDataLUTableKeyName, cachedItemName, kGameDataLUTableFields, function (err, gameContext, data) {

        if (err != null) {
            doneCallback(err, gameContext);
            return;
        }
        
        var cachedItemStr = data == null ? "null" : JSON.stringify(data, null, 4);
        console.log("Requested current value of cached item, got back: " + cachedItemStr);

        var currentCachedItem = data != null ? data.CachedItem : null;

        // If we don't have any current data, we can't trust what state we're in, so do a full scan of the table.  Otherwise,
        // if we have some current data and an update, we try to avoid doing a full scan.
        if (currentCachedItem != null && itemUpdate != null) {
            
            console.log("We have an item cached, and record updates, going to try to not do a full scan.");

            var outputShape = dynamoDB.api.operations.getItem.output;
            var updatedItem = itemUpdate.dynamodb.NewImage != null ? dynamoDoc.getTranslator().translateOutput({ Item : itemUpdate.dynamodb.NewImage }, outputShape).Item : null;
            var updatedItemKeyMatches = currentCachedItem[tableKeyName] == itemUpdate.dynamodb.Keys[tableKeyName].S;

            // For inserts, we see if the new value should be cached instead of the current cached value
            if (itemUpdate.eventName == "INSERT") {
                console.log("Item Insert detected...");

                if (shouldUpdateCallback(currentCachedItem, updatedItem)) {
                    console.log("Callback says we should update the cached item, so updating...");
                    gameDataLUTable._UpdateDynamo(gameContext, cachedItemName, updatedItem, doneCallback);
                    return;
                }
                else {
                    console.log("Callback said we shouldn't update the cached item, so bailing on update...");
                    doneCallback(null, gameContext);
                    return;
                }
            }
            else if (itemUpdate.eventName == "MODIFY") {
                console.log("Item Modification detected...");

                // For modifies, if the key matches, we check to see if that cached item is still valid
                if (updatedItemKeyMatches) {

                    console.log("Modification of currently cached record detected...");

                    if (shouldUpdateCallback(null, updatedItem)) {
                        console.log("Callback says we should keep the item, even though it was modified, so updating the cached version...");
                        gameDataLUTable._UpdateDynamo(gameContext, cachedItemName, updatedItem, doneCallback);
                        return;
                    }
                    else {
                        console.log("Callback said we shouldn't keep the item cached, so rescaning the table to find the correct value...");
                        gameDataLUTable._ScanTable(gameContext, tableName, cachedItemName, shouldUpdateCallback, doneCallback);
                        return;
                    }
                }
                // Otherwise, if the key doesn't match, we check to see if we care about th new one now
                else {
                    console.log("Currently cached record wasn't modified, but another one was, so checking to see if we should use that one instead...");

                    if (shouldUpdateCallback(currentCachedItem, updatedItem)) {

                        console.log("Callback said the modified item is now better than the currently cached one, so using that one instead...");

                        gameDataLUTable._UpdateDynamo(gameContext, cachedItemName, updatedItem, doneCallback);
                        return;
                    }
                    else {
                        console.log("Callback said the currently cached item is still better than the modified one, so bailing on update...");
                        doneCallback(null, gameContext);
                        return;
                    }
                }
            }
            // For removes, we only care if we deleted the key we are currently on.  
            else if (itemUpdate.eventName == "REMOVE") {
                console.log("Item Remove detected...");

                if (updatedItemKeyMatches) {
                    console.log("The currently cached item was removed from the original table, so rescanning the table...");
                    gameDataLUTable._ScanTable(gameContext, tableName, cachedItemName, shouldUpdateCallback, doneCallback);
                    return;
                }
                else {
                    console.log("Currently cached item wasn't removed, so bailing on update...");
                    doneCallback(null, gameContext);
                    return;
                }
            }
        }
        else {
            console.log("There wasn't an item cached, so rescanning table...");

            gameDataLUTable._ScanTable(gameContext, tableName, cachedItemName, shouldUpdateCallback, doneCallback);
            return;
        }
        
    });
};

exports._UpdateDynamo = function (gameContext, cachedItemName, cachedItem, callback) {
    
    console.log("Updating cached item '" + cachedItemName + "'...");

    if (cachedItem == null) {
        console.log("Deleting cached item...");

        var deleteItemRequest = {
            "TableName" : kGameDataLUTableName,
            "Key" : { }
        };
        
        deleteItemRequest.Key[kGameDataLUTableKeyName] = cachedItemName;

        dynamoDoc.delete(deleteItemRequest, function (err, data) {
            callback(err, gameContext);
        })
    }
    else {
        console.log("Updating cached item to have contents: " + JSON.stringify(cachedItem,null,4)); 

        var putItemRequest = {
            "TableName" : kGameDataLUTableName,
            "Item" : {
                "CachedItem" : cachedItem
            }
        };
        
        putItemRequest.Item[kGameDataLUTableKeyName] = cachedItemName; 

        dynamoDoc.put(putItemRequest, function (err, data) {
            callback(err, gameContext);
        });
    }
};

exports._ScanTable = function (gameContext, tableName, cachedItemName, shouldUpdateCallback, doneCallback) {
    
    console.log("Starting scan of table '" + tableName + "'");

    var gameDataLUTable = this;

    dynamoDoc.scan({ TableName : tableName }, function (err, data) {
        
        if (err != null) {
            doneCallback(err, gameContext);
            return;
        }
        
        var itemWinner = null;
        
        for (var i = 0; i < data.Items.length; ++i) {
            if (shouldUpdateCallback(itemWinner, data.Items[i])) {
                itemWinner = data.Items[i];
            }
        }
        
        if (itemWinner == null) {
            console.log("After scanning the table, could not find a suitable item to cache");
        }
        else {
            console.log("After scanning the table, a suitable item to cache was found");
        }

        gameDataLUTable._UpdateDynamo(gameContext, cachedItemName, itemWinner, doneCallback);
    });
};