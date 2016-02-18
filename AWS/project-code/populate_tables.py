#
# All or portions of this file Copyright (c) Amazon.com, Inc. or its affiliates or
# its licensors.
#
# For complete copyright and license terms please see the LICENSE at the root of this
# distribution (the "License"). All use of this software is governed by the License,
# or, if provided, by the license below or the license accompanying this file. Do not
# remove or modify any license notices. This file is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#
import properties
import custom_resource_response
import boto3

dynamodb = boto3.resource('dynamodb') 

def handler(event, context):
    
    if event['RequestType'] != 'Create':
        return custom_resource_response.succeed(event, context, {}, "PopulateTables")

    props = properties.load(event, {
        'AchievementsTable': properties.String(),
        'DailyGiftTable': properties.String(),
        'ItemTable': properties.String(),
        'MessageOfTheDayTable': properties.String(),
        'MissionTable': properties.String(),
        'GameDataLUTable' : properties.String()
        })

    achievementsTable = dynamodb.Table(props.AchievementsTable)
    dailyGiftTable = dynamodb.Table(props.DailyGiftTable)
    itemTable = dynamodb.Table(props.ItemTable)
    messageOfTheDayTable = dynamodb.Table(props.MessageOfTheDayTable)
    missionTable = dynamodb.Table(props.MissionTable)
    gameDataLUTable = dynamodb.Table(props.GameDataLUTable)

    achievement = {
        "CompletionCriteria": "player.LastScore > 300",
        "Description": "You survived for 300 seconds!",
        "ItemReward": "FancyShip",
        "Name": "300SecondSurvival"
    }

    achievementsTable.put_item(Item=achievement)

    dailyGift = {
        "Date": "12-06-2015",
        "EndDate": "infinity",
        "Gifts": [
            {
                "Name": "ShieldMission",
                "Type": "mission"
            }
        ]
    }

    dailyGiftTable.put_item(Item=dailyGift)

    shieldItem = {
        "Name" : "Shield",
        "Persist" : False
    }

    fancyShipItem = {
        "Name" : "FancyShip",
        "Persist" : True
    }

    itemTable.put_item(Item=shieldItem)
    itemTable.put_item(Item=fancyShipItem)

    messageOfTheDay = {
        "Date": "12-06-2015",
        "EndDate": "infinity",
        "Message": "Message of the Day!"
    }

    messageOfTheDayTable.put_item(Item=messageOfTheDay)

    mission = {
        "CompletionText": "You completed the Shield Mission!",
        "Description": "Complete 1 game to get the Shield!",
        "ItemReward": "Shield",
        "Name": "ShieldMission",
        "NumberOfGamesReq": 1
    }

    missionTable.put_item(Item=mission)

    dailyGiftCached = {
        "CachedItem": {
            "Date": "12-06-2015",
            "EndDate": "infinity",
            "Gifts": [
                {
                    "Name": "ShieldMission",
                    "Type": "mission"
                }
            ]
        },
        "CachedItemName": "TodaysGift"
    }

    messageOfTheDayCached = {
        "CachedItem": {
            "Date": "12-06-2015",
            "EndDate": "infinity",
            "Message": "Message of the Day!"
        },
        "CachedItemName": "TodaysMessage"
    }

    gameDataLUTable.put_item(Item=dailyGiftCached)
    gameDataLUTable.put_item(Item=messageOfTheDayCached)

    custom_resource_response.succeed(event, context, {}, "PopulateTables")