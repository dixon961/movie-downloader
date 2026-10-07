import * as diskService from '../services/diskService.js';

export async function getDisk(req, res, next) {
  try {
    const info = await diskService.getDiskSpace();
    res.json(info);
  } catch (err) {
    console.error('Error in getDisk controller:', err.message);
    const errorToPass = err instanceof Error ? err : new Error(err.message || 'Failed to fetch disk space.');
    errorToPass.status = 500;
    next(errorToPass);
  }
}