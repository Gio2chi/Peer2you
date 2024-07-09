const winston = require('winston')
const transports = winston.transports

const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
}
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    verbose: 'green',
    debug: 'blue'
}
const defaultLogger = winston.createLogger({
    levels: LEVELS,
    transports: [
        new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }),
        new winston.transports.File({ filename: 'log/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'log/warn.log', level: 'warn' }),
        new winston.transports.File({ filename: 'log/verbose.log', level: 'verbose' }),
        new winston.transports.File({ filename: 'log/info.log', level: 'info' }),
        new winston.transports.File({ filename: 'log/debug.log', level: 'debug' }),
        new winston.transports.Http({ host: 'localhost', port: 9001, path: '/api/console/test' })
    ],
    exceptionHandlers: [
        new transports.File({ filename: 'log/exceptions.log' })
    ],
    rejectionHandlers: [
        new transports.File({ filename: 'log/rejections.log' })
    ],
    exitOnError: false
});
winston.addColors(colors)

const sql = defaultLogger.child({ logger: 'SQL' })
const tutor = defaultLogger.child({ logger: 'Tutor' })
const client = defaultLogger.child({ logger: 'Client' })

module.exports = {
    defaultLogger,
    sql,
    tutor,
    client
}