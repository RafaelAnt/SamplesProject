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

//I hope this import is stable. We doing this to do some instanceof checking later
var dynamodbSet = require('aws-sdk/lib/dynamodb/set');


/*
 * FieldManager tracks fields in a dynamo db table row, keeping track of fields to know whether or not they have been loaded from Dynamo,
 * and/or been changed in the currently running Lambda. 
 */
exports.FieldManager = function () {
    
    this._fields = {};
    this._dirtyFields = {};
    this._loaded = {};
    
    this.RegisterField = function (fieldName, dfltValue) {
        this._fields[fieldName] = dfltValue;
        
        this["Set" + fieldName] = function (value) {
            this._fields[fieldName] = value;
            this["Set" + fieldName + "Dirty"](true);
        };

        this["Get" + fieldName] = function () {
            return this._fields[fieldName];
        };
        
        this["Is" + fieldName + "Dirty"] = function () {
            return fieldName in this._dirtyFields;
        };
        
        this[fieldName + "WasLoaded"] = function () {
            return fieldName in this._loaded;
        };
        
        this[fieldName + "IsDirtyOrLoaded"] = function () {
            return this["Is" + fieldName + "Dirty"]() || this[fieldName + "WasLoaded"]();
        };

        this["Set" + fieldName + "Dirty"] = function (dirty) {
            this._dirtyFields[fieldName] = dirty;
        };

        if (typeof dfltValue == "number") {
            this["AddTo" + fieldName] = function (numToAdd) {
                this._fields[fieldName] += numToAdd;
                this["Set" + fieldName + "Dirty"](true);
            };
        }
        
        if (dfltValue instanceof dynamodbSet) {
            this["AddToSet" + fieldName] = function (newMember) {
                //Only add to the set if it doesn't already exist
                if (this._fields[fieldName].values.indexOf(newMember) == -1) {
                    this._fields[fieldName].values.push(newMember);
                    //It seems you always have to create a new set instead of mutating in place.
                    this._fields[fieldName] = dynamo.createSet(this._fields[fieldName].values);
                    this["Set" + fieldName + "Dirty"](true);
                }
            };
        }
    };
    
    this.HasDirtyFields = function () {
        return Object.keys(this._dirtyFields).length > 0;
    }

    this.ClearDirty = function () {
        this._dirtyFields = {};
    };
    
    this.SaveToDB = function (gameContext, tableName, keyName, keyValue, callback) {
        var updateRequest = {};
        updateRequest.TableName = tableName;
        updateRequest.Key = {};
        updateRequest.Key[keyName] = keyValue;
        
        updateRequest.ExpressionAttributeValues = {};
        
        var updateExpression = "set";
        
        for (var property in this._dirtyFields) {
            if (this._dirtyFields.hasOwnProperty(property)) {
                updateExpression += " " + property + " = :" + property + ",";
                updateRequest.ExpressionAttributeValues[":" + property] = this._fields[property];
            }
        }
        
        updateRequest.UpdateExpression = updateExpression.substring(0, updateExpression.length - 1);
        
        var fieldManager = this;
        
        dynamo.update(updateRequest, function (err, data) {

            if (err == null) {
                fieldManager.ClearDirty();
            }
            
            callback(err, gameContext);
        });
    };

    this.LoadFromDB = function (gameContext, tableName, keyName, keyValue, callback) {
        var getRequest = {};
        getRequest.TableName = tableName;
        getRequest.Key = {};
        getRequest.Key[keyName] = keyValue;
        getRequest.AttributesToGet = [];
        
        for (var property in this._fields) {
            if (this._fields.hasOwnProperty(property)) {
                getRequest.AttributesToGet.push(property);
            }
        }

        var fieldManager = this;
        
        dynamo.get(getRequest, function (err, data) {

            if (err == null) {
                for (var property in data.Item) {
                    if (property in fieldManager._fields) {
                        fieldManager._fields[property] = data.Item[property];

                        if (property in fieldManager._dirtyFields) {
                            delete fieldManager._dirtyFields[property];
                        }
                       
                        fieldManager._loaded[property] = 1;
                    }
                }
            }

            callback(null, gameContext);
        });
    };
};