import type { IMessages, IRecords, IStatus } from '../types.js';

jest.mock('query-string', () => ({
  stringify: (params: Record<string, unknown>) =>
    Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&'),
}));

jest.mock('ramda', () => ({
  mergeRight: (a: Record<string, unknown>, b: Record<string, unknown>) => ({
    ...a,
    ...b,
  }),
}));

jest.mock('request-promise-native', () => ({}));

import { Client } from '../client.js';

function createMockHttpClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  } as any;
}

const clientParams = {
  endpoint: 'https://api.sumologic.com/api/v1',
  sumoApiId: 'test-id',
  sumoApiKey: 'test-key',
};

describe('Client', () => {
  // Technique: Behavioral contract — verify correct URL construction for records.
  it('calls the records endpoint with correct URL and pagination', async () => {
    const httpClient = createMockHttpClient();
    const expectedRecords: IRecords = {
      fields: [
        { name: '_sourceHost', fieldType: 'string', keyField: true },
        { name: '_count', fieldType: 'int', keyField: false },
      ],
      records: [{ map: { _sourceHost: 'host-a', _count: '5' } }],
    };
    (httpClient.get as jest.Mock).mockResolvedValue(expectedRecords);

    const client = new Client(httpClient, clientParams);
    const result = await client.records('job-abc');

    expect(httpClient.get).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/search/jobs/job-abc/records'),
      }),
    );
    expect(result).toEqual(expectedRecords);
  });

  // Technique: Behavioral contract — verify correct URL for messages.
  it('calls the messages endpoint with correct URL', async () => {
    const httpClient = createMockHttpClient();
    const expectedMessages: IMessages = {
      fields: [{ name: '_raw', fieldType: 'string', keyField: false }],
      messages: [{ map: { _raw: 'test log' } }],
    };
    (httpClient.get as jest.Mock).mockResolvedValue(expectedMessages);

    const client = new Client(httpClient, clientParams);
    const result = await client.messages('job-xyz');

    expect(httpClient.get).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/search/jobs/job-xyz/messages'),
      }),
    );
    expect(result).toEqual(expectedMessages);
  });

  // Technique: Parameterized verification — custom pagination overrides defaults.
  it('applies custom pagination parameters to records', async () => {
    const httpClient = createMockHttpClient();
    (httpClient.get as jest.Mock).mockResolvedValue({ fields: [], records: [] });

    const client = new Client(httpClient, clientParams);
    await client.records('job-abc', { offset: 10, limit: 100 });

    const calledUrl = (httpClient.get as jest.Mock).mock.calls[0][0].url;
    expect(calledUrl).toContain('offset=10');
    expect(calledUrl).toContain('limit=100');
  });

  // Technique: Behavioral contract — verify status endpoint returns counts.
  it('fetches job status with message and record counts', async () => {
    const httpClient = createMockHttpClient();
    const expectedStatus: IStatus = {
      state: 'DONE GATHERING RESULTS',
      messageCount: 42,
      recordCount: 7,
      histogramBuckets: [],
      pendingErrors: [],
      pendingWarnings: [],
    };
    (httpClient.get as jest.Mock).mockResolvedValue(expectedStatus);

    const client = new Client(httpClient, clientParams);
    const result = await client.status('job-status');

    expect(result.messageCount).toBe(42);
    expect(result.recordCount).toBe(7);
    expect(result.state).toBe('DONE GATHERING RESULTS');
  });

  // Technique: Edge case — endpoint with trailing slash is normalized.
  it('strips trailing slash from endpoint', async () => {
    const httpClient = createMockHttpClient();
    (httpClient.get as jest.Mock).mockResolvedValue({ fields: [], records: [] });

    const client = new Client(httpClient, {
      ...clientParams,
      endpoint: 'https://api.sumologic.com/api/v1/',
    });
    await client.records('job-slash');

    const calledUrl = (httpClient.get as jest.Mock).mock.calls[0][0].url;
    expect(calledUrl).toMatch(/api\/v1\/search/);
    expect(calledUrl).not.toMatch(/v1\/\/search/);
  });
});
