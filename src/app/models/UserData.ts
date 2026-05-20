import { Timestamp } from "firebase/firestore";

export interface UserData {
    uid: string;
    email: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    nickname?: string;
    role?: string;
}