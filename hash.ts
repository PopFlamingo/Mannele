import * as crypto from 'crypto';

export async function hash(input: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        hash.update(input, 'utf8');
        const digest = hash.digest();
        const base64Hash = digest.toString('base64');
        resolve(base64Hash.substring(0, 10));
    });
}