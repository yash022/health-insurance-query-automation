import 'server-only';
import { database } from './database';
import { storage } from './storage';

export const env = { ...process.env, DB: database, BUCKET: storage };
