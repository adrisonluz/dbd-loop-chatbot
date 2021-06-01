const firebase = require('firebase');
const tmi = require('tmi.js');
const settings = require('./settings.json');

/** Twitch Functions */
const twitchClient = new tmi.client(
    {
        options: {debug: false},
        connection: {
            secure: true,
            reconnect: true
        },
        identity: {
            username: settings.TwitchUser,
            password: settings.TwitchAuth
        },
        channels: ["goombaBr", "snowyyingyang"]
    }
)

twitchClient.connect();

twitchClient.on("connected", (address, port) => {
    console.log("Twitch Bot has started on port" + port);
});

twitchClient.on("message", (channel, context, message, self) => {
    let username = context["display-name"];

    if(isCommand(channel, message, username)){
        let userData = getUser(username);
        let thisDate = new Date().getTime();
        console.log('getUser:', userData);

        if(!userData.length){
            userData = {
                "username": username,
                "times": 0,
                "hit": false,
                "pallet": false,
                "luck" : settings.Luck,
                "created": thisDate,
                "updated": thisDate
            }
            saveUser(userData, 'startBot');
        }

        if(checkLoopTimes(channel, userData)){    
            if(message.toLowerCase() === settings.Prefix + "loop"){
                userLoop(channel, userData);
            }
    
            if(message.toLowerCase() === settings.Prefix + "pallet"){
                dropPallet(channel, userData);
            }
        }
    }

    return false;
});

/** Firebase */
firebase.initializeApp(settings.Firebase);
let database = firebase.database();

firebase.database().ref("loops/").on("value", data => {
    //console.log(data.val());
}, errorObject => {
    console.log(errorObject.code);
});

const getUser = (username) => {
    let returnData = [];
    
    database.ref('loops/' + username).on('value', function(snapshot) {
        snapshot.forEach(function(childSnapshot) {
            returnData[childSnapshot.key] = childSnapshot.val();
        });
    });

    return returnData;
}

const saveUser = (userData, msg) => {
    userData.updated = new Date().getTime();

    database.ref("loops/" + userData.username).set(userData, function(error) {
        if (error) {
        // The write failed...
        console.log(msg + ": Failed with error: " + error)
        } else {
        // The write was successful...
        console.log(msg + ": User saved!");
        }
    });
}

const delUser = (username) => {
    database.ref('loops/' + username).remove();
    return false;
}

/** General Functions */
const getPrefix = (message) => {
    if(message.indexOf("dbd.") != -1){
        return true;
    }

    return false;
}

const isCommand = (channel, message, username) => {
    if(getPrefix(message)){
        if(settings.Commands.includes(message)){
            return true;
        }

        twitchClient.say(channel, "@" + username + " Huummmm command not found!");
    }

    return false;
}

/** Loop Functions */
const userLoop = (channel, userData) => {
    if(Math.random() >= settings.Luck){
        userHit(channel, userData);
        return false;
    } 
    
    let times = userData.times;
    userData.times = (times + 1);

    let luck = userData.luck;
    userData.luck = (luck + 0.02);

    twitchClient.say(channel, "Loop! The killer keeps looping with you. Good luck " + userData.username + "!");
    saveUser(userData, 'userLoop');

    if(Math.random() < userData.luck){
        userWin(channel, userData);
    }
}

const checkLoopTimes = (channel, userData) => {
    if(userData.times < 4){
        return true;
    }

    userHit(channel, userData);
}

const userHit = (channel, userData) => {
    if(userData.hit === true){
        userDie(channel, userData);
        return false;
    }

    if(!userData.pallet){
        twitchClient.say(channel, "HIT! @" + userData.username + " sorry, the killer got you! You should have dropped the pallet.");
    } else if(!userData.pallet && userData.times === 0) {
        twitchClient.say(channel, "HIT! @" + userData.username + " sorry, the killer got you! You dropped the pallete too close to the killer, who do you think he is?");
    } else {
        twitchClient.say(channel, "HIT! @" + userData.username + " sorry, the killer got you! You shouldn't have dropped the pallet so soon.");
    }
    
    userData.hit = true;
    userData.times = 0;
    saveUser(userData, 'userHit');
    return false;
}

const dropPallet = (channel, userData) => {
    if(userData.pallet){
        userHit(channel, userData);
    }

    userData.pallet = true;
    userData.times = 0;
    saveUser(userData, 'dropPallet');

    userLoop(channel, userData);
}

const userWin = (channel, userData) => {
    twitchClient.say(channel, "WIN: @" + userData.username + " you are really amazing! The killer gave up on you. Congratulations!");
    delUser(userData.username);
    return false;
}

const userDie = (channel, userData) => {
    twitchClient.say(channel, "DIED: @" + userData.username + " you were hooked. The entity awaits you! The killer won!!!");
    delUser(userData.username);
    return false;
}