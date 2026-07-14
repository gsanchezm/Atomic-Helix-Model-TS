import pino, { type DestinationStream } from 'pino';

const stream: DestinationStream = process.env.NODE_ENV !== 'production'
    ? pino.transport({
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            destination: 2,
        },
    })
    : pino.destination(2);

export const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, stream);
