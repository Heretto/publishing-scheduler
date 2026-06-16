import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInstances: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> }[] = [];

vi.mock('axios', () => ({
  default: {
    create: () => {
      const instance = { get: vi.fn(), post: vi.fn() };
      mockInstances.push(instance);
      return instance;
    },
  },
}));

import { HerettoCcmsClient } from '../../src/heretto/heretto-ccms-client';

describe('HerettoCcmsClient', () => {
  let client: HerettoCcmsClient;
  let restGet: ReturnType<typeof vi.fn>;
  let searchPost: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockInstances.length = 0;
    client = new HerettoCcmsClient({
      baseUrl: 'https://example.com/rest',
      searchBaseUrl: 'https://example.com/ezdnxtgen/api',
      username: 'testuser',
      password: 'testpass',
    });
    restGet = mockInstances[0].get;
    searchPost = mockInstances[1].post;
  });

  describe('getFolderContents', () => {
    it('parses attribute-based XML folder response', async () => {
      restGet.mockResolvedValueOnce({
        data: `<folder id="folder-123" parent-folder-id="root-1">
          <name>My Folder</name>
          <children>
            <folder name="Subfolder" id="sub-1"/>
            <resource name="Document 1" type="Topic" id="doc-1" mime-type="application/xml"/>
            <resource name="Document 2" type="Map" id="doc-2" mime-type="application/xml"/>
          </children>
        </folder>`,
      });

      const result = await client.getFolderContents('folder-123');
      expect(result.id).toBe('folder-123');
      expect(result.title).toBe('My Folder');
      expect(result.type).toBe('folder');
      expect(result.children).toHaveLength(3);
      expect(result.children[0].id).toBe('sub-1');
      expect(result.children[0].title).toBe('Subfolder');
      expect(result.children[0].type).toBe('folder');
      expect(result.children[1].id).toBe('doc-1');
      expect(result.children[1].title).toBe('Document 1');
      expect(result.children[1].type).toBe('Topic');
      expect(result.children[2].id).toBe('doc-2');
    });

    it('handles single child element (not wrapped in array)', async () => {
      restGet.mockResolvedValueOnce({
        data: `<folder id="folder-456">
          <name>Single Child Folder</name>
          <children>
            <resource name="Only Doc" type="Topic" id="doc-only"/>
          </children>
        </folder>`,
      });

      const result = await client.getFolderContents('folder-456');
      expect(result.children).toHaveLength(1);
      expect(result.children[0].id).toBe('doc-only');
      expect(result.children[0].title).toBe('Only Doc');
    });

    it('handles legacy child-element XML format', async () => {
      restGet.mockResolvedValueOnce({
        data: `<folder>
          <id>folder-legacy</id>
          <title>Legacy Folder</title>
          <type>folder</type>
          <children>
            <resource>
              <id>doc-1</id>
              <title>Document 1</title>
              <type>topic</type>
            </resource>
          </children>
        </folder>`,
      });

      const result = await client.getFolderContents('folder-legacy');
      expect(result.id).toBe('folder-legacy');
      expect(result.title).toBe('Legacy Folder');
      expect(result.children).toHaveLength(1);
      expect(result.children[0].id).toBe('doc-1');
      expect(result.children[0].title).toBe('Document 1');
    });
  });

  describe('getDocumentInfo', () => {
    it('parses attribute-based XML document response', async () => {
      restGet.mockResolvedValueOnce({
        data: `<resource id="doc-789" name="My Document" type="Topic" mime-type="application/xml">
          <owner>user@example.com</owner>
          <created>2024-01-01T00:00:00Z</created>
          <modified>2024-06-01T12:00:00Z</modified>
        </resource>`,
      });

      const result = await client.getDocumentInfo('doc-789');
      expect(result.id).toBe('doc-789');
      expect(result.title).toBe('My Document');
      expect(result.type).toBe('Topic');
      expect(result.owner).toBe('user@example.com');
      expect(result.created).toBe('2024-01-01T00:00:00Z');
      expect(result.modified).toBe('2024-06-01T12:00:00Z');
    });
  });

  describe('getBranches', () => {
    it('parses attribute-based XML branches response', async () => {
      restGet.mockResolvedValueOnce({
        data: `<branches>
          <branch name="main" id="branch-1">
            <repository>repo-1</repository>
          </branch>
          <branch name="develop" id="branch-2">
            <repository>repo-1</repository>
          </branch>
        </branches>`,
      });

      const result = await client.getBranches();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('branch-1');
      expect(result[0].name).toBe('main');
      expect(result[0].repository).toBe('repo-1');
      expect(result[1].id).toBe('branch-2');
      expect(result[1].name).toBe('develop');
    });

    it('handles single branch', async () => {
      restGet.mockResolvedValueOnce({
        data: `<branches>
          <branch name="main" id="branch-only"/>
        </branches>`,
      });

      const result = await client.getBranches();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('branch-only');
      expect(result[0].name).toBe('main');
    });
  });

  describe('searchDocuments', () => {
    it('posts JSON search query and returns results', async () => {
      searchPost.mockResolvedValueOnce({
        data: {
          results: [
            { id: 'search-1', title: 'Found Doc', type: 'topic' },
            { id: 'search-2', title: 'Another Doc', type: 'map' },
          ],
          total: 2,
        },
      });

      const result = await client.searchDocuments({ query: 'test' });
      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.results[0].id).toBe('search-1');
      expect(result.results[0].title).toBe('Found Doc');
    });

    it('handles empty search results', async () => {
      searchPost.mockResolvedValueOnce({
        data: { results: [], total: 0 },
      });

      const result = await client.searchDocuments({ query: 'nonexistent' });
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
