export class Exception extends Error {
    public errorKey: string;
    public errorMessage: string;
    public status: number;

    constructor(errorKey: string, message?: string, status: number = 500) {
        super(message || errorKey);
        this.errorKey = errorKey;
        this.errorMessage = message || errorKey;
        this.status = status;
    }
}

export function createException(errorKey: string, message?: string, status?: number): Exception {
    return new Exception(errorKey, message, status);
}
