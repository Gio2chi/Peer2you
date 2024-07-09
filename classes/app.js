const db = require('../modules/mysql')
const sheetsApi = require('../modules/sheetAPI')
const sendMail = require('../modules/sendMail')
const events = require('events');
const fs = require('fs')
const path = require('path')

const logger = require('../modules/logger')

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

// TODO: tenere conto delle ore pcto fatte con le lezioni stesse
// TODO: update every user year after a year

class App {
    #eventEmmitter = new events.EventEmitter()
    constructor(delay, start = false) {
        logger.defaultLogger.info('Creating new application', { delay, startOnCreation: start})
        this.delay = delay
        this.running = start

        if(start) this.#runLoop()
    }
    start(delay) {
        if(delay) this.delay = delay
        if(!this.running) {
            this.running = true
            this.#runLoop()
        }
    }
    stop() {
        if(this.running) {
            logger.defaultLogger.info('Stopping the application')
            this.running = false
        }
    }
    async report(fileName, email) {
        let gropedDates = await db.executeQuery('SELECT COUNT(*), tutor_id FROM dates WHERE date<NOW() GROUP BY tutor_id;')
        let results = []
        for(const obj of gropedDates) {
            let hours = obj['COUNT(*)'] * 2
            let tutor = (await db.executeQuery('SELECT * FROM tutors WHERE ID='+ obj.tutor_id +';'))[0]
            results.push({surname: tutor.surname, name: tutor.name, email: tutor.email, pcto_hours: hours})
        }
        fs.writeFileSync(fileName, JSON.stringify(results, null, 2))

        sendMail({to: email, subject: 'Recap delle ore totali', attachments: [{filename: 'recap.json', path: fileName}]})
    }
    async #runLoop() {
        if(!this.running) return

        logger.defaultLogger.info('Starting the application')
        while(this.running) {
            await sheetsApi.getNewClientsAndTutors(async ({ res, calendar, status }) => {
                res.calendar = calendar
                if(status == 'client') {
                    this.#eventEmmitter.emit('client', res)
                } else if(status == 'tutor') {
                    this.#eventEmmitter.emit('tutor', res)
                }
            })

            let jsonHistory = JSON.parse(fs.readFileSync(path.join(__dirname, '../history.json')))

            logger.client.info('Scanning for clients available')
            let clients = await db.executeQuery('SELECT * FROM clients;')
            for(const client of clients) {
                // get days where the client is available for the lessons
                let availabilities = await sheetsApi.getAvailability(client.calendar_id)
                // analise if the client is cancelling a session or adding a new one
                // if the client is cancelling a date we need to detect if in that day the client had a lesson and in that case we need to cancel it
                // in case the client is adding a new day for the lessons we need to find if in that day there is a tutor available
                if(jsonHistory.clients[client.email]) {
                    let pastAv = jsonHistory.clients[client.email]
                    
                    let newAv = this.#isGiving(pastAv, availabilities)
                    let deletedAv = this.#isCancelling(pastAv, availabilities)

                    if(newAv) {
                        newAv.forEach(async newDate => {
                            await this.#onGiven(newDate, client.ID, jsonHistory, 'client');
                        })
                    }
                    if(deletedAv) {
                        deletedAv.forEach(async delAv => {
                            await this.#onCancel(delAv, client.ID, 'client');
                        })
                    }
                }
                jsonHistory.clients[client.email] = availabilities;
            }

            logger.client.info('Scanning for tutor available')
            let tutors = await db.executeQuery('SELECT * FROM tutors;')
            for(const tutor of tutors) {
                let availabilities = await sheetsApi.getAvailability(tutor.calendar_id)

                if(jsonHistory.tutors[tutor.email]) {
                    let pastAv = jsonHistory.tutors[tutor.email]
                    
                    let newAv = this.#isGiving(pastAv, availabilities)
                    let deletedAv = this.#isCancelling(pastAv, availabilities)

                    if(newAv) {
                        newAv.forEach(async newDate => {
                            await this.#onGiven(newDate, tutor.ID, jsonHistory, 'tutor');
                        })
                    }
                    if(deletedAv) {
                        deletedAv.forEach(async delAv => {
                            await this.#onCancel(delAv, tutor.ID, 'tutor');
                        })
                    }
                }
                jsonHistory.tutors[tutor.email] = availabilities;
            }

            fs.writeFileSync(path.join(__dirname, '../history.json'), JSON.stringify(jsonHistory, null, 4))
            await new Promise(resolve => {
                setTimeout(() => {resolve()}, this.delay)
            })
        }
    }

    #isCancelling (pastAv, newAv) {
        if(typeof pastAv != 'object' || typeof newAv != 'object') return false
        
        let cancellingDates = []
        pastAv.forEach(date => {
            if(!newAv.includes(date)) cancellingDates.push(date)
        });
        if(cancellingDates.length == 0) return false;
        return cancellingDates
    }
    #isGiving (pastAv, newAv) {
        if(typeof pastAv != 'object' || typeof newAv != 'object') return false

        let newDates = []
        newAv.forEach(date => {
            if(!pastAv.includes(date)) newDates.push(date)
        });

        if(newDates.length == 0) return false;
        return newDates
    }

    async #onCancel (date, id, status) {
        if(status != 'client' && status != 'tutor') return;

        if(stringToDate(date) <= new Date().addDays(2)) return;

        let appointmentWasSet = await db.executeQuery(`SELECT * FROM dates WHERE date = ${this.#dateToFormat(date)} AND ${status}_id = ${id};`)
        if(appointmentWasSet.length == 0) return;

        let tmpClient = (await db.executeQuery('SELECT * FROM clients WHERE id = ' + appointmentWasSet[0].client_id + ';'))[0]
        let tmpTutor = (await db.executeQuery('SELECT * FROM tutors WHERE id = ' + appointmentWasSet[0].tutor_id + ';'))[0]
        console.log(`Lezione fra ${tmpClient.surname + " " + tmpClient.name} e ${tmpTutor.surname + " " + tmpTutor.name} è stato annullata;`)
        sendMail({to: tmpClient.email, subject: `Lezione annullata`, text: `<h1>Lezione annullata</h1> <br/> <p>La lezione con ${tmpTutor.surname + " " + tmpTutor.name} del ${date} è stata annullata</p>`})
        sendMail({to: tmpTutor.email, subject: `Lezione annullata`, text: `<h1>Lezione annullata</h1> <br/> <p>La lezione con ${tmpClient.surname + " " + tmpClient.name} del ${date} è stata annullata</p>`})

        logger.client.info('Cancelling appointment between ' + tmpClient.name + ' ' + tmpClient.surname + '(client) and ' + tmpTutor.name + ' ' + tmpClient.surname + '(tutor)')
        //cancel the appointment
        await db.executeQuery('DELETE FROM dates WHERE ID = '+ appointmentWasSet[0].ID +' ;')
    }
    // TODO: Make function that order even by marks
    async #onGiven (date, id, jsonHistory, status) {
        if(status != 'client' && status != 'tutor') return;
        
        if(stringToDate(date) <= new Date().addDays(2)) return;

        if(status == 'client') {
            let client = (await db.executeQuery('SELECT * FROM clients WHERE ID = ' + id + ';'))[0]
            if(!client) return;
            let clientSubjects = JSON.parse(client.subjects)

            // Get tutors older than the client and order them first by class (from the older to the younger) and than by pcto hours (from the one who needs the most to the one who needs the less)
            // SELECT *, pcto+(SELECT COUNT(*) FROM dates WHERE tutor_id=tutors.ID)*2 AS pcto_ FROM tutors ORDER BY class DESC, pcto_;
            let tutors = await db.executeQuery('SELECT * FROM tutors where class > '+ client.class + ' ORDER BY class DESC, pcto;')

            for(const tutor of tutors) {
                // If the tutor hasnt given availabilities yet we go next
                if(!jsonHistory.tutors[tutor.email]) continue;

                // If the tutor has already an appointment we go next
                let isOccupied = await db.executeQuery(`SELECT * FROM dates WHERE date = ${this.#dateToFormat(date)} AND tutor_id = ?;`, [tutor.ID])
                if(isOccupied[0]) continue;

                // Get tutor availabilities
                let availabilities = jsonHistory.tutors[tutor.email]
                // Check if the tutor is available in that date
                if(availabilities.includes(date)) {
                    // Get tutor subjects
                    let subjects = JSON.parse(tutor.subjects)
                    for(const subject of subjects) {
                        // Check if the tutor has the client's subject
                        if(clientSubjects.includes(subject)) {
                            // if the tutor has the client's subject we create the appointment and we store in the database
                            await db.executeQuery(`INSERT INTO dates (tutor_id, client_id, date) VALUES (?, ?, ${this.#dateToFormat(date)});`, [tutor.ID, client.ID])

                            console.log(`La lezione fra ${client.name + " " + client.surname} e ${tutor.name + " " + tutor.surname} è stato fissata;`)
                            sendMail({to: client.email, subject: `Lezione fissata`, text: `<h1>Lezione fissata</h1> <br/> <p>É stata fissata un Lezione in data ${date} per ${subject} con ${tutor.surname + " " + tutor.name}</p>`})
                            sendMail({to: tutor.email, subject: `Lezione fissata`, text: `<h1>Lezione fissata</h1> <br/> <p>É stata fissata un Lezione in data ${date} per ${subject} con ${client.surname + " " + client.name}</p>`})

                            logger.client.info('Setting appointment between ' + client.name + ' ' + client.surname + '(client) and ' + tutor.name + ' ' + tutor.surname + '(tutor)')
                            return;
                        }
                    }
                }
            }
        } else {
            let tutor = (await db.executeQuery('SELECT * FROM tutors WHERE ID = ' + id + ';'))[0]
            if(!tutor) return;
            let tutorSubjects = JSON.parse(tutor.subjects)

            // Get clients younger than the tutor
            let clients = await db.executeQuery('SELECT * FROM clients WHERE class < ' + tutor.class + ';')

            for(const client of clients) {
                // If the client hasnt given availabilities yet we go next
                if(!jsonHistory.clients[client.email]) continue;

                // If the client has already an appointment we go next
                let isOccupied = await db.executeQuery(`SELECT * FROM dates WHERE date = ${this.#dateToFormat(date)} AND client_id = ?;`, [client.ID])
                if(isOccupied[0]) continue;
                // Get client availabilities
                let availabilities = jsonHistory.clients[client.email]
                // Check if the client is available in that date
                if(availabilities.includes(date)) {
                    // Get client subjects
                    let subjects = JSON.parse(client.subjects)
                    for(const subject of subjects) {
                        if(tutorSubjects.includes(subject)) {
                            // if the client has the tutor's subject we create the appointment and we store in the database
                            await db.executeQuery(`INSERT INTO dates (tutor_id, client_id, date) VALUES (?, ?, ${this.#dateToFormat(date)});`, [tutor.ID, client.ID])
                            
                            console.log(`Lezione fra ${client.name + " " + client.surname} e ${tutor.name + " " + tutor.surname} è stato fissata;`)
                            sendMail({to: client.email, subject: `Lezione fissata`, text: `<h1>Lezione fissata</h1> <br/> <p>É stata fissata un Lezione in data ${date} per ${subject} con ${tutor.surname + " " + tutor.name}</p>`})
                            sendMail({to: tutor.email, subject: `Lezione fissata`, text: `<h1>Lezione fissata</h1> <br/> <p>É stata fissata un Lezione in data ${date} per ${subject} con ${client.surname + " " + client.name}</p>`})


                            return;
                        }
                    }
                }
            }

        }
    }

    #dateToFormat (date) {
        return `STR_TO_DATE("${date}", "%d/%c/%Y")`
    }

    on(event, callback) {
        if(event == 'client') this.#eventEmmitter.on('client', callback)
        if(event == 'tutor') this.#eventEmmitter.on('tutor', callback)
    }
}

module.exports = App