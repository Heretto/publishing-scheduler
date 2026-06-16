import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    path: process.env.DB_PATH || './data/scheduler.db',
  },
  heretto: {
    baseUrl: process.env.HERETTO_API_BASE_URL || 'https://demo-nxt.heretto.com/ezdnxtgen/api/v2',
    ccmsBaseUrl: process.env.HERETTO_CCMS_BASE_URL ||
      (process.env.HERETTO_API_BASE_URL || 'https://demo-nxt.heretto.com/ezdnxtgen/api/v2')
        .replace('/ezdnxtgen/api/v2', '/rest'),
    searchBaseUrl: (process.env.HERETTO_API_BASE_URL || 'https://demo-nxt.heretto.com/ezdnxtgen/api/v2')
      .replace('/ezdnxtgen/api/v2', '/ezdnxtgen/api'),
    username: process.env.HERETTO_USERNAME || '',
    password: process.env.HERETTO_PASSWORD || '',
  },
};

export function validateConfig(): string[] {
  const warnings: string[] = [];
  if (!config.heretto.username) {
    warnings.push('HERETTO_USERNAME is not set — Heretto API calls will fail');
  }
  if (!config.heretto.password) {
    warnings.push('HERETTO_PASSWORD is not set — Heretto API calls will fail');
  }
  return warnings;
}
