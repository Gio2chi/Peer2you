// Import dependencies
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { GoogleAuth } = require('google-auth-library');
const db = require('./mysql')

const logger = require('./logger');

const sheets = google.sheets("v4");
const drive = google.drive({ version: "v3" });

const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, "../credentials.json")));

const nSubjects = 6;

const defaultCalendarId = "10u_KN0bZun23SakSfl9ReAUz4wsG4a9nWjAZxPybZjE"
const tutorsResponsesSheetId = "13Uo0lqeVNlcKyndHljaqLm9RaL4BnXrPG5NI3qK625U"
const clientsResponsesSheetId = "1yp-FwQYs4nNEbELmodYuqccy6cXIZBqBGVdbCXXDEys"

// Configure auth client
const authClient = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key.replace(/\\n/g, "\n"),
    [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.metadata.readonly",
        "https://www.googleapis.com/auth/drive.appdata",
        "https://www.googleapis.com/auth/drive.metadata",
        "https://www.googleapis.com/auth/drive.photos.readonly"
    ]
);

const months = ['Settembre', 'Ottobre', 'Novembre', 'Dicembre', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno']

let getTutors = async () => {
    // Authorize the client
    const token = await authClient.authorize().catch(e => {
        logger.defaultLogger.error('Google authorization failed!', { stack: 'error at /modules/sheetAPI.js : getTutors', error: e })
    });

    // Set the client credentials
    authClient.setCredentials(token);

    // Get the rows
    const res = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId: tutorsResponsesSheetId,
        range: "A:M",
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t retrieve tutors sheet', { stack: 'error at /modules/sheetAPI.js : getTutors', error: e })
    });

    logger.tutor.profile('getTutors algorithm', { level: 'debug' })
    // All of the answers
    const answers = [];

    // Set rows to equal the rows
    const rows = res.data.values;

    // Check if we have any data and if we do add it to our answers array
    if (rows.length) {
        // Remove the headers
        rows.shift()

        // For each row
        for (const row of rows) {
            answers.push({ timeStamp: row[0], surname: row[2], name: row[3], email: row[1], class: parseInt(row[4]), pcto: row[5], subjects: row[6].split(", "), reportLink: row[7] });
        }
    }

    logger.tutor.profile('getTutors algorithm', { level: 'debug' })

    return answers;
}
let getClients = async () => {
    // Authorize the client
    const token = await authClient.authorize().catch(e => {
        logger.defaultLogger.error('Google authorization failed!', { stack: 'error at /modules/sheetAPI.js : getClients', error: e })
    });

    // Set the client credentials
    authClient.setCredentials(token);

    // Get the rows
    const res = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId: clientsResponsesSheetId,
        range: "A:M",
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t retrieve clients sheet', { stack: 'error at /modules/sheetAPI.js : getClients', error: e })
    });

    logger.client.profile('getClients algorithm', { level: 'debug' })
    // All of the answers
    const answers = [];

    // Set rows to equal the rows
    const rows = res.data.values;

    // Check if we have any data and if we do add it to our answers array
    if (rows.length) {
        // Remove the headers
        rows.shift()

        // For each row
        for (const row of rows) {
            answers.push({ timeStamp: row[0], surname: row[3], name: row[2], email: row[1], class: parseInt(row[4]), subjects: row[5].split(", ") });
        }
    }

    logger.client.profile('getClients algorithm', { level: 'debug' })

    return answers;
}

// let onResponse = async (response, status) => {
//     if (status != 'client' || status != 'tutor') return -1;

//     // UPDATE DATABASE
//     let isRespAlreadyExisting = (await db.executeQuery('SELECT * FROM ' + status + 's WHERE email = ?', [response.email]))[0]
//     if (isRespAlreadyExisting) {
//         let subjects = JSON.parse(isRespAlreadyExisting.subjects)
//         if (status == 'tutor') {
//             db.executeQuery('UPDATE tutors SET subjects = ?, link_pagella = ? WHERE ID=' + isRespAlreadyExisting.id, [JSON.stringify(response.subjects), response.pagella])
//         } else{ 
//             if (subjects.includes(response.subject)) return
//             subjects.push(response.subject)
//             db.executeQuery('UPDATE clients SET subjects = ? WHERE ID=' + isRespAlreadyExisting.id, [JSON.stringify(subjects)])
//         }
//     }
//     if (status == 'client') {
//         let calendar = createNewCalendar(response.email, status)
//         db.executeQuery('INSERT INTO clients (name, surname, email, calendar_id, subjects) VALUES (?, ?, ?, ?, ?, ?);', [response.name, response.surname, response.email, calendar.id, response.subject])
//     } else {
//         let calendar = createNewCalendar(response.email, status)
//         db.executeQuery('INSERT INTO tutors (name, surname, email, calendar_id, subjects, link_pagella) VALUES (?, ?, ?, ?, ?, ?);', [response.name, response.surname, response.email, calendar.id, response.subjects, response.pagella])
//     }
// }

let getCalendar = async (id) => {
    // Authorize the client
    const token = await authClient.authorize().catch(e => {
        logger.defaultLogger.error('Google authorization failed!', { stack: 'error at /modules/sheetAPI.js : getCalendar', error: e })
    });

    // Set the client credentials
    authClient.setCredentials(token);

    // Get the rows
    const res = await sheets.spreadsheets.values.get({
        auth: authClient,
        spreadsheetId: id,
        range: "B3:P",
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t retrieve calendar sheet', { calendarId: id, stack: 'error at /modules/sheetAPI.js : getCalendar', error: e })
    });

    logger.defaultLogger.profile('getCalendar algorithm', { level: 'debug' })

    // Set rows to equal the rows
    const rows = res.data.values;

    let indexOfMonths = []
    rows.forEach((row, index) => {
        for (let i = 0; i != months.length; i++) {
            if (row.includes(months[i])) {
                indexOfMonths[months[i]] = index
            }
        }
    })

    let result = []
    for (let i = 0; i != months.length; i++) {
        let month = []
        if (i < 4) {
            for (let y = indexOfMonths[months[i]] + 2, counter = 0; y != indexOfMonths[months[i]] + 14; y++, counter++) {
                month[counter] = []
                for (let x = 0; x != 7; x++) {
                    month[counter][x] = rows[y][x] || ''
                }
            }
        } else {
            for (let y = indexOfMonths[months[i]] + 2, counter = 0; y != indexOfMonths[months[i]] + 14; y++, counter++) {
                month[counter] = []
                if (rows[y] == undefined) continue;
                for (let x = 0; x != 7; x++) {
                    month[counter][x] = rows[y][x + 8] || ''
                }
            }
        }

        let dates = [];
        let availabilities = [];
        for (let j = 0; j != 6; j++) {
            if (month[j * 2].length == 0 || month[j * 2][0] == '') { break }
            dates.push(...month[j * 2])
            availabilities.push(...month[j * 2 + 1])
        }
        result[months[i]] = {
            dates,
            availabilities
        }
    }

    logger.defaultLogger.profile('getCalendar algorithm', { calendarId: id, level: 'debug' })

    return result
};
let getAvailability = async (id) => {
    let calendar = await getCalendar(id)

    logger.defaultLogger.profile('getAvailability algorithm', { level: 'debug' })

    let dates = []
    Object.keys(calendar).forEach(key => {
        for (let i = 0; i != calendar[key].availabilities.length; i++) {
            if (calendar[key].availabilities[i] != '' && !dates.includes(calendar[key].dates[i])) dates.push(calendar[key].dates[i])
        }
    })

    logger.defaultLogger.profile('getAvailability algorithm', { calendarId: id, level: 'debug' })

    return dates
}

let getFiles = async () => {
    // Authorize the client
    const token = await authClient.authorize().catch(e => {
        logger.defaultLogger.error('Google authorization failed!', { stack: 'error at /modules/sheetAPI.js : getFiles', error: e })
    });

    // Set the client credentials
    authClient.setCredentials(token);

    const res = await drive.files.list({
        spaces: 'drive',
        auth: authClient,
        fields: "files(kind, id, name, mimeType, parents)"
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t retrieve drive files', { stack: 'error at /modules/sheetAPI.js : getFiles', error: e })
    });
    return res.data.files;

}
let deleteFiles = async (files = []) => {
    // Authorize the client
    const token = await authClient.authorize();

    // Set the client credentials
    authClient.setCredentials(token);

    files.forEach(file => {
        drive.files.delete({
            fileId: file.id,
            auth: authClient
        })
    })
    return
}

let createNewCalendar = async (userEmail, status) => {
    // Authorize the client
    const token = await authClient.authorize().catch(e => {
        logger.defaultLogger.error('Google authorization failed!', { stack: 'error at /modules/sheetAPI.js : createNewCalendar', error: e })
    });

    // Set the client credentials
    authClient.setCredentials(token);

    let folder = status == 'tutor' ? "181nRqfTjcian9f9vvI_Jkv5XW8jIJARw" : "1Oont9lxuOJmhn0IRBoKja1aK2oDIMHNL"

    // Create a copy of the original calendar
    let res = await drive.files.copy({
        auth: authClient,
        fileId: defaultCalendarId,
        requestBody: {
            name: userEmail,
            capabilities: {
                canAcceptOwnership: true,
            },
            parents: [folder]
        }
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t create a copy of the default calendar', { userEmail, status, stack: 'error at /modules/sheetAPI.js : createNewCalendar', error: e })
    });

    let copyInfo = res.data

    // Create default permission for admin account
    drive.permissions.create({
        fileId: copyInfo.id,
        auth: authClient,
        requestBody: {
            pendingOwner: true,
            emailAddress: process.env.PROJECT_EMAIL,
            type: 'user',
            role: 'writer',
        }
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t create default permission (' + process.env.PROJECT_EMAIL + ') for the calendar', { userEmail, status, stack: 'error at /modules/sheetAPI.js : createNewCalendar', error: e })
    });

    // Create permission for user account
    drive.permissions.create({
        fileId: copyInfo.id,
        auth: authClient,
        requestBody: {
            emailAddress: userEmail,
            type: 'user',
            role: 'writer',
        }
    }).catch(e => {
        logger.defaultLogger.error('Couldn\'t create default permission for the calendar', { userEmail, status, stack: 'error at /modules/sheetAPI.js : createNewCalendar', error: e })
    });

    return copyInfo
}
let getCalendarInfo = async (userEmail, status) => {
    let files = await getFiles()

    for (let file of files) {
        if (file.name.includes(userEmail)) return file;
    }

    return await createNewCalendar(userEmail)
}

Date.prototype.addDays = function (d) {
    this.setTime(this.getTime() + d * 86400000);
    return this;
};
let stringToDate = (string) => {
    //  Convert a "dd/MM/yyyy" string into a Date object
    let d = string.split("/");
    let dat = new Date(new Date().getFullYear() + '/' + d[1] + '/' + d[0]);
    return dat;
}

let getNewClientsAndTutors = (callback) => {
    return new Promise(async (resolve, reject) => {
        logger.defaultLogger.profile('getNewClientsAndTutors algorithm', { level: 'debug' })
        let clients = await getClients()
        for (const client of clients) {
            logger.client.info('Searching for ' + client.surname + ' ' +  client.name + ' (' + client.email + ')')

            let query = await db.executeQuery("SELECT * FROM clients WHERE email = ?;", [client.email])
            if (query.length == 0) {
                logger.client.info(client.surname + ' ' +  client.name + ' (' + client.email + ') not found')
                logger.client.info('Creating new calendar for ' + client.surname + ' ' +  client.name + ' (' + client.email + ')')

                let calendar = await createNewCalendar(client.email, "client")
                logger.client.info('Inserting ' + client.surname + ' ' +  client.name + ' (' + client.email + ') in the database')

                await db.executeQuery("INSERT INTO clients (name, surname, email, calendar_id, subjects, class) VALUES(?, ?, ?, ?, ?, ?);", [client.name, client.surname, client.email, calendar.id, JSON.stringify(client.subjects), client.class])
                // callback({ timeStamp: client.timeStamp, surname: client.surname, name: client.name, email: client.email, class: client.class, subjects: client.subjects, calendar: calendar, status: 'client' })
                callback({ response: client, calendar: calendar, status: 'client' })
            } else {
                logger.client.info('Updating record of ' + client.surname + ' ' +  client.name + ' (' + client.email + ')')
                await db.executeQuery('UPDATE clients SET subjects = ? WHERE ID=' + query[0].ID + ';', [JSON.stringify(client.subjects)])
            }
        }

        logger.defaultLogger.profile('getNewClientsAndTutors algorithm', { level: 'debug', verbose: 'profiling clients loop'})
        logger.defaultLogger.profile('getNewClientsAndTutors algorithm', { level: 'debug'})

        let tutors = await getTutors()
        for (const tutor of tutors) {
            logger.tutor.info('Searching for ' + tutor.surname + ' ' +  tutor.name + ' (' + tutor.email + ')')

            let query = await db.executeQuery("SELECT * FROM tutors WHERE email = ?;", [tutor.email])
            if (query.length == 0) {
                logger.tutor.info(tutor.surname + ' ' +  tutor.name + ' (' + tutor.email + ') not found')
                logger.tutor.info('Creating new calendar for ' + tutor.surname + ' ' +  tutor.name + ' (' + tutor.email + ')')

                let calendar = await createNewCalendar(tutor.email, "tutor")

                logger.tutor.info('Inserting ' + tutor.surname + ' ' +  tutor.name + ' (' + tutor.email + ') in the database')
                await db.executeQuery("INSERT INTO tutors (name, surname, email, calendar_id, subjects, link_pagella, class, pcto) VALUES(?, ?, ?, ?, ?, ?, ?, ?);", [tutor.name, tutor.surname, tutor.email, calendar.id, JSON.stringify(tutor.subjects), tutor.reportLink, tutor.class, tutor.pcto])
                // callback({ timeStamp: tutor.timeStamp, surname: tutor.surname, name: tutor.name, email: tutor.email, class: tutor.class, subjects: tutor.subjects, pagella: tutor.pagella, calendar: calendar, status: 'tutor' })
                callback({ response: tutor, calendar: calendar, status: 'tutor' })
            } else {
                logger.tutor.info('Updating record of ' + tutor.surname + ' ' +  tutor.name + ' (' + tutor.email + ')')
                await db.executeQuery('UPDATE tutors SET subjects = ?, link_pagella = ? WHERE ID=' + query[0].ID + ';', [JSON.stringify(tutor.subjects), tutor.reportLink])
            }
        }
        
        logger.defaultLogger.profile('getNewClientsAndTutors algorithm', { level: 'debug', verbose: 'profiling tutor loop'})

        resolve()
    })
}

let downloadReport = async (link) => {
    // Authorize the client
    const token = await authClient.authorize();

    // Set the client credentials
    authClient.setCredentials(token);

    let stream = fs.createWriteStream(path.join(__dirname, '../reports/0.pdf'))
    const file = await drive.files.get({
        auth: authClient,
        fileId: link.substring(link.search('id=') + 3, link.length),
        alt: 'media'
    })
    fs.writeFileSync(path.join(__dirname, '../reports/0.pdf'), file.data)
}

// downloadReport("https://drive.google.com/open?id=1xx8JjXDfsyAqJAZ5ImXlcxM6z1xclbGg")

module.exports = {
    getTutors,
    getClients,
    getCalendar,
    getAvailability,
    getFiles,
    deleteFiles,
    createNewCalendar,
    getCalendarInfo,
    getNewClientsAndTutors
}