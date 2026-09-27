import { z } from 'zod';
import { Service } from "@vecmat/kirinriki";

export const UserSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.email('Invalid email'),
    age: z.number().int().positive().optional(),
});

export type User = z.infer<typeof UserSchema>;

@Service()
export class UserService {
    private users: User[] = [];

    async findById(id: string): Promise<User | null> {
        return this.users[parseInt(id)] || null;
    }

    async create(user: User): Promise<User> {
        this.users.push(user);
        return user;
    }

    async list(): Promise<User[]> {
        return this.users;
    }
}
