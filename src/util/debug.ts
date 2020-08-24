export type Logger = (message?: any, ...optionalParams: any[]) => void;

let mLogger: Logger|undefined;
let mErrorLogger: Logger|undefined;

export function setLogger(logger: Logger, errorLogger?: Logger): void {
    mLogger = logger;
    mErrorLogger = errorLogger != null ? errorLogger : logger;
}

export function isEnable(): boolean {
    return mLogger != null;
}

// tslint:disable-next-line:no-shadowed-variable
export function log(message?: any, ...optionalParams: any[]): void {
    if (mLogger) {
        mLogger(message, ...optionalParams);
    }
}

// tslint:disable-next-line:no-shadowed-variable
export function error(message?: any, ...optionalParams: any[]): void {
    if (mErrorLogger) {
        mErrorLogger(message, ...optionalParams);
    }
}
