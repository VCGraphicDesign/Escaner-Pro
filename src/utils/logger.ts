/**
 * Logger para la aplicación
 * Reemplaza console.log con un sistema de logging controlado
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  data?: unknown;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      data,
    };

    this.logs.push(entry);

    // Mantener solo los últimos maxLogs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Output a consola en desarrollo
    if (import.meta.env.DEV) {
      const timestamp = new Date(entry.timestamp).toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
      
      switch (level) {
        case 'error':
          console.error(prefix, message, data || '');
          break;
        case 'warn':
          console.warn(prefix, message, data || '');
          break;
        case 'debug':
          console.debug(prefix, message, data || '');
          break;
        default:
          console.log(prefix, message, data || '');
      }
    }
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}

// Exportar instancia única
export const logger = new Logger();
