export type Logger = (message?: any, ...optionalParams: any[]) => void;

let logger: Logger|undefined;
let errorLogger: Logger|undefined;

export function setLogger(log: Logger, error?: Logger): void {
    logger = log;
    errorLogger = error != null ? error : log;
}

export function isEnable(): boolean {
    return logger != null;
}

export function log(message?: any, ...optionalParams: any[]): void {
    if (logger) {
        logger(message, ...optionalParams);
    }
}
export function error(message?: any, ...optionalParams: any[]): void {
    if (errorLogger) {
        errorLogger(message, ...optionalParams);
    }
}
