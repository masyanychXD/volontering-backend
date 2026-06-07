declare global {
    namespace Express {
        interface Request {
            user?: {
                role?: "admin" | "coordinator" | "student";
            }
        }
    }
}
export {};