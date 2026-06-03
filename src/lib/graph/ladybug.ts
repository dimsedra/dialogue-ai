import { Database, Connection } from '@ladybugdb/core';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), '.dialogue-graph');

// Define global interface for TypeScript
declare global {
  var _ladybugDb: Database | undefined;
  var _ladybugConn: Connection | undefined;
}

export const getGraphConnection = async (): Promise<Connection> => {
  if (!globalThis._ladybugDb || !globalThis._ladybugConn) {
    globalThis._ladybugDb = new Database(DB_PATH);
    globalThis._ladybugConn = new Connection(globalThis._ladybugDb);
    
    const conn = globalThis._ladybugConn;
    
    // Initialize default graph schema for Dialogue
    const ddlStatements = [
      `CREATE NODE TABLE Task(id STRING, title STRING, category STRING, PRIMARY KEY (id));`,
      `CREATE NODE TABLE Event(id STRING, title STRING, PRIMARY KEY (id));`,
      `CREATE NODE TABLE Habit(id STRING, name STRING, PRIMARY KEY (id));`,
      `CREATE NODE TABLE Memory(id STRING, text STRING, embedding FLOAT[384], PRIMARY KEY (id));`,
      `CREATE NODE TABLE ChatSession(id STRING, title STRING, PRIMARY KEY (id));`,
      `CREATE NODE TABLE Workspace(id STRING, name STRING, PRIMARY KEY (id));`,
      `CREATE NODE TABLE Person(id STRING, name STRING, PRIMARY KEY (id));`,
      `CREATE REL TABLE BLOCKED_BY(FROM Task TO Task);`,
      `CREATE REL TABLE PREREQUISITE_FOR(FROM Task TO Task);`,
      `CREATE REL TABLE COLLABORATES_WITH(FROM Task TO Person, FROM Event TO Person);`,
      `CREATE REL TABLE RELATED_TO(FROM Event TO Task);`,
      `CREATE REL TABLE REFERENCES(FROM Memory TO Memory, FROM Task TO Memory, FROM Event TO Memory, FROM Habit TO Memory);`,
      `CREATE REL TABLE MENTIONS_TASK(FROM Memory TO Task);`,
      `CREATE REL TABLE MENTIONS_EVENT(FROM Memory TO Event);`,
      `CREATE REL TABLE MENTIONS_HABIT(FROM Memory TO Habit);`,
      `CREATE REL TABLE CREATED_IN_SESSION(FROM Memory TO ChatSession, FROM Task TO ChatSession, FROM Event TO ChatSession, FROM Habit TO ChatSession);`,
      `CREATE REL TABLE BELONGS_TO(FROM Memory TO Workspace, FROM Task TO Workspace, FROM Event TO Workspace, FROM ChatSession TO Workspace, FROM Habit TO Workspace);`
    ];

    for (const query of ddlStatements) {
      try {
        await conn.query(query);
      } catch (e: any) {
        // If tables already exist, we ignore it. Otherwise, it's a fatal error (disk, corruption).
        if (!e.message?.toLowerCase().includes('already exists')) {
          console.error(`Fatal error executing graph DDL: ${query}`);
          throw e;
        }
      }
    }
    console.log('Graph schema validated successfully at', DB_PATH);
  }
  return globalThis._ladybugConn!;
};
