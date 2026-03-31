import { search, SearchResult } from '../client.js';
import { Client } from '@/lib/sumologic/client.js';

jest.mock('@/utils/pii', () => ({
  maskSensitiveInfo: jest.fn((text: string) => text),
  isMaskingEnabled: jest.fn(() => false),
}));

function createMockClient(overrides: Partial<Client> = {}): Client {
  return {
    job: jest.fn().mockResolvedValue({ id: 'job-123' }),
    status: jest.fn().mockResolvedValue({
      state: 'DONE GATHERING RESULTS',
      messageCount: 0,
      recordCount: 0,
      histogramBuckets: [],
      pendingErrors: [],
      pendingWarnings: [],
    }),
    messages: jest.fn().mockResolvedValue({ fields: [], messages: [] }),
    records: jest.fn().mockResolvedValue({ fields: [], records: [] }),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Client;
}

describe('search', () => {
  // Technique: State-based testing — verify returned shape based on API responses.
  it('returns only messages when recordCount is zero', async () => {
    const mockClient = createMockClient({
      status: jest.fn().mockResolvedValue({
        state: 'DONE GATHERING RESULTS',
        messageCount: 2,
        recordCount: 0,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      }),
      messages: jest.fn().mockResolvedValue({
        fields: [{ name: '_raw', fieldType: 'string', keyField: false }],
        messages: [
          { map: { _raw: 'log line 1' } },
          { map: { _raw: 'log line 2' } },
        ],
      }),
    });

    const result = await search(mockClient, '_sourceCategory=test');

    expect(result.messages).toHaveLength(2);
    expect(result.records).toBeUndefined();
    expect(mockClient.messages).toHaveBeenCalledWith('job-123');
    expect(mockClient.records).not.toHaveBeenCalled();
  });

  // Technique: State-based testing — verify records appear when recordCount > 0.
  it('returns records when recordCount is greater than zero', async () => {
    const mockClient = createMockClient({
      status: jest.fn().mockResolvedValue({
        state: 'DONE GATHERING RESULTS',
        messageCount: 5,
        recordCount: 3,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      }),
      messages: jest.fn().mockResolvedValue({
        fields: [{ name: '_raw', fieldType: 'string', keyField: false }],
        messages: [{ map: { _raw: 'raw line' } }],
      }),
      records: jest.fn().mockResolvedValue({
        fields: [
          { name: '_sourceHost', fieldType: 'string', keyField: true },
          { name: '_count', fieldType: 'int', keyField: false },
        ],
        records: [
          { map: { _sourceHost: 'host-a', _count: '10' } },
          { map: { _sourceHost: 'host-b', _count: '7' } },
          { map: { _sourceHost: 'host-c', _count: '3' } },
        ],
      }),
    });

    const result = await search(mockClient, '_sourceCategory=test | count by _sourceHost');

    expect(result.messages).toBeDefined();
    expect(result.records).toHaveLength(3);
    expect(result.records![0].map._sourceHost).toBe('host-a');
    expect(result.records![0].map._count).toBe('10');
    expect(mockClient.records).toHaveBeenCalledWith('job-123');
  });

  // Technique: State-based testing — pure aggregate queries can have zero messages.
  it('returns empty messages and populated records for aggregate-only queries', async () => {
    const mockClient = createMockClient({
      status: jest.fn().mockResolvedValue({
        state: 'DONE GATHERING RESULTS',
        messageCount: 0,
        recordCount: 2,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      }),
      records: jest.fn().mockResolvedValue({
        fields: [
          { name: '_count', fieldType: 'int', keyField: false },
        ],
        records: [
          { map: { _count: '42' } },
          { map: { _count: '58' } },
        ],
      }),
    });

    const result = await search(mockClient, '_sourceCategory=test | count');

    expect(result.messages).toHaveLength(0);
    expect(result.records).toHaveLength(2);
    expect(mockClient.messages).not.toHaveBeenCalled();
  });

  // Technique: Behavior verification — confirm polling loops until DONE.
  it('polls status until job is done gathering results', async () => {
    const statusMock = jest
      .fn()
      .mockResolvedValueOnce({
        state: 'GATHERING RESULTS',
        messageCount: 0,
        recordCount: 0,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      })
      .mockResolvedValueOnce({
        state: 'GATHERING RESULTS',
        messageCount: 1,
        recordCount: 0,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      })
      .mockResolvedValueOnce({
        state: 'DONE GATHERING RESULTS',
        messageCount: 1,
        recordCount: 0,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      });

    const mockClient = createMockClient({
      status: statusMock,
      messages: jest.fn().mockResolvedValue({
        fields: [],
        messages: [{ map: { _raw: 'done' } }],
      }),
    });

    const result = await search(mockClient, 'test query');

    expect(statusMock).toHaveBeenCalledTimes(3);
    expect(result.messages).toHaveLength(1);
  });

  // Technique: Error path testing — verify graceful degradation on API failure.
  it('returns empty messages on API error', async () => {
    const mockClient = createMockClient({
      job: jest.fn().mockRejectedValue(new Error('API unavailable')),
    });

    const result = await search(mockClient, 'failing query');

    expect(result.messages).toEqual([]);
    expect(result.records).toBeUndefined();
  });

  // Technique: Behavior verification — ensure cleanup always runs.
  it('deletes the search job after fetching results', async () => {
    const mockClient = createMockClient({
      status: jest.fn().mockResolvedValue({
        state: 'DONE GATHERING RESULTS',
        messageCount: 1,
        recordCount: 0,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      }),
      messages: jest.fn().mockResolvedValue({
        fields: [],
        messages: [{ map: { _raw: 'line' } }],
      }),
    });

    await search(mockClient, 'cleanup test');

    expect(mockClient.delete).toHaveBeenCalledWith('job-123');
  });

  // Technique: Behavioral contract — verify query and time range are forwarded.
  it('passes query and time range to the job creation', async () => {
    const jobMock = jest.fn().mockResolvedValue({ id: 'job-456' });
    const mockClient = createMockClient({ job: jobMock });

    await search(mockClient, 'specific query', {
      from: '2025-01-01T00:00:00Z',
      to: '2025-01-02T00:00:00Z',
    });

    expect(jobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'specific query',
        from: '2025-01-01T00:00:00Z',
        to: '2025-01-02T00:00:00Z',
      }),
    );
  });
});

describe('sanitizeEntry via search', () => {
  // Technique: State-based testing — PII masking integration for records.
  it('applies PII sanitization to _raw fields in records', async () => {
    const { maskSensitiveInfo } = jest.requireMock('@/utils/pii') as {
      maskSensitiveInfo: jest.Mock;
    };
    (maskSensitiveInfo as jest.Mock).mockImplementation((text: string) =>
      text.includes('@') ? '[EMAIL REDACTED]' : text,
    );

    const mockClient = createMockClient({
      status: jest.fn().mockResolvedValue({
        state: 'DONE GATHERING RESULTS',
        messageCount: 0,
        recordCount: 1,
        histogramBuckets: [],
        pendingErrors: [],
        pendingWarnings: [],
      }),
      records: jest.fn().mockResolvedValue({
        fields: [],
        records: [
          {
            map: {
              _raw: 'user@example.com logged in',
              host: 'prod-server-1',
            },
          },
        ],
      }),
    });

    const result = await search(mockClient, 'aggregate query');

    expect(result.records).toHaveLength(1);
    expect(result.records![0].map._raw).toBe('[EMAIL REDACTED]');
    expect(result.records![0].map.host).toBe('prod-server-1');

    (maskSensitiveInfo as jest.Mock).mockImplementation((text: string) => text);
  });
});
