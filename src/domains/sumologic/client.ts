import moment from 'moment';
import * as Sumo from '@/lib/sumologic/client.js';
import { maskSensitiveInfo } from '@/utils/pii.js';

export interface SearchResult {
    messages: any[];
    records?: any[];
}

interface SumoAPIError {
    statusCode?: number;
    message: string;
    error?: any;
    response?: {
        body: any;
    };
}

function sanitizeEntry(entry: any): any {
    if (entry.map && typeof entry.map === 'object') {
        const plainMap: Record<string, string> = {};
        Object.keys(entry.map).forEach((key) => {
            const rawValue = entry.map[key]?.toString() || '';
            if (key === '_raw' || key === 'response') {
                plainMap[key] = maskSensitiveInfo(rawValue);
            } else {
                plainMap[key] = rawValue;
            }
        });

        const maskedRaw = entry._raw
            ? maskSensitiveInfo(entry._raw.toString())
            : undefined;

        return { ...entry, map: plainMap, _raw: maskedRaw };
    }

    if (entry._raw && typeof entry._raw === 'string') {
        return { ...entry, _raw: maskSensitiveInfo(entry._raw) };
    }

    if (entry.response && typeof entry.response === 'string') {
        return { ...entry, response: maskSensitiveInfo(entry.response) };
    }

    if (typeof entry === 'string') {
        return entry;
    }

    if (typeof entry === 'object' && entry !== null) {
        const result = { ...entry };
        if (result._raw && typeof result._raw === 'string') {
            result._raw = maskSensitiveInfo(result._raw);
        }
        if (result.response && typeof result.response === 'string') {
            result.response = maskSensitiveInfo(result.response);
        }
        return result;
    }

    return entry;
}

export async function search(
    client: Sumo.Client,
    query: string,
    timeRange?: { from?: string; to?: string },
): Promise<SearchResult> {
    const now = moment();
    const defaultTimeRange = {
        from: now.subtract(1, 'day').format(),
        to: now.format(),
    };

    const { from, to } = { ...defaultTimeRange, ...timeRange };

    // Create search job
    const jobParams = {
        query,
        from,
        to,
        timeZone: 'America/New_York',
    };

    try {
        const { id } = await client.job(jobParams);

        // Wait for job completion
        let status;
        do {
            try {
                status = await client.status(id);
                if (status.state !== 'DONE GATHERING RESULTS') {
                    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
                }
            } catch (statusError) {
                console.log('Error fetching job status:', statusError);
                throw statusError;
            }
        } while (status.state !== 'DONE GATHERING RESULTS');

        const isAggregateQuery = status.recordCount > 0;

        const [messages, records] = await Promise.all([
            !isAggregateQuery && status.messageCount > 0
                ? client.messages(id)
                : Promise.resolve({ fields: [], messages: [] }),
            isAggregateQuery
                ? client.records(id)
                : Promise.resolve(undefined),
        ]);

        await client.delete(id);

        const sanitizedMessages = messages.messages.map(sanitizeEntry);

        const result: SearchResult = { messages: sanitizedMessages };

        if (records) {
            result.records = records.records.map(sanitizeEntry);
        }

        return result;
    } catch (error) {
        const apiError = error as SumoAPIError;
        console.error('Sumo Logic API Error:', {
            statusCode: apiError.statusCode,
            message: apiError.message,
            error: apiError.error,
            responseBody: apiError.response?.body,
        });
        return {
            messages: [],
        };
    }
}
