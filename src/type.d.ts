type Schedule = {
    day: string;
    startTime: string;
    endTime: string;
};

type UserRoles = "admin" | "coordinator" | "student";

type RateLimitRole = UserRoles | "guest";