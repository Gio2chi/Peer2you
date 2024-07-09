require('dotenv').config()
const mysql = require('mysql')

const logger = require('./logger')

const connection = mysql.createConnection({
    host: process.env.MYSQL_HOST,
    database: process.env.MYSQL_USER,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD
})

function executeQuery(sqlCmd, params) {
    return new Promise(function (resolve, reject) {
        if (params)
            connection.query(sqlCmd, params, (err, results, fields) => {
                if(err) logger.sql.error(err)
                resolve(JSON.parse(JSON.stringify(err || results)))
            })
        else connection.query(sqlCmd, (err, results, fields) => {
            if(err) logger.sql.error(err)
            resolve(JSON.parse(JSON.stringify(err || results)))
        })
    })
    //connection.end()
}

module.exports = {
    executeQuery
};
