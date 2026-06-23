import { Component, Inject, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { HerettoService, CcmsResource, CcmsFolder, CcmsRelease } from '../../../core/services/heretto.service';

const DITAMAP_ONLY_KEY = 'docpicker_ditamap_only';

export interface DocumentPickerData {
  selectedIds: string[];
  selectedFolderIds?: string[];
  selectedReleases?: Record<string, { id: string; name: string }>;
  branch?: string;
  /** When true, disables the DITA maps-only filter (e.g. for ditaval/parameter file pickers) */
  allowAllTypes?: boolean;
}

interface BreadcrumbItem {
  id: string;
  title: string;
}

@Component({
  selector: 'app-document-picker',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatInputModule, MatFormFieldModule, MatTabsModule, MatListModule,
    MatCheckboxModule, MatProgressSpinnerModule, MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>Select Documents</h2>
    <mat-dialog-content class="picker-content">
      <div class="filter-bar" *ngIf="!data?.allowAllTypes">
        <mat-slide-toggle
          [checked]="ditamapOnly"
          (change)="onDitamapOnlyChange($event.checked)"
          color="primary">
          DITA maps only
        </mat-slide-toggle>
        <span class="status-filter-wrap">
          <label class="status-filter-label">Status</label>
          <select class="status-filter-select"
                  [(ngModel)]="selectedStatusFilter"
                  (focus)="onStatusSelectFocus()"
                  (change)="onStatusFilterChange()">
            <option value="">Any status</option>
            <option *ngIf="statusValuesLoading" disabled value="">Loading…</option>
            <option *ngFor="let s of statusValues" [value]="s">{{ s }}</option>
          </select>
        </span>
      </div>
      <mat-tab-group>
        <mat-tab label="Browse">
          <div class="breadcrumbs" *ngIf="breadcrumbs.length > 0">
            <span *ngFor="let crumb of breadcrumbs; let last = last">
              <a (click)="navigateToFolder(crumb.id)" *ngIf="!last">{{ crumb.title }}</a>
              <span *ngIf="last">{{ crumb.title }}</span>
              <span *ngIf="!last"> / </span>
            </span>
          </div>
          <div class="loading" *ngIf="browseLoading">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
          <mat-list *ngIf="currentFolder && !browseLoading">
            <mat-list-item *ngFor="let item of filteredChildren" class="item-row"
              [class.status-mismatch]="selectedStatusFilter && item.type !== 'folder' && !matchesStatusFilter(item)">
              <mat-checkbox
                [checked]="item.type === 'folder' ? isFolderSelected(item.id) : isSelected(item.id)"
                [disabled]="!!(selectedStatusFilter && item.type !== 'folder' && !matchesStatusFilter(item))"
                (change)="item.type === 'folder' ? toggleFolderSelection(item) : toggleSelection(item)"
              ></mat-checkbox>
              <mat-icon class="item-icon" [class.loading-icon]="statusLoadingIds.has(item.id)">
                {{ item.type === 'folder' ? 'folder' : (statusLoadingIds.has(item.id) ? 'hourglass_empty' : 'description') }}
              </mat-icon>
              <span class="item-title"
                [class.clickable]="item.type === 'folder'"
                (click)="item.type === 'folder' ? navigateToFolder(item.id) : null">
                {{ item.title || item.id }}
              </span>
              <span class="item-type">{{ item['name'] || formatType(item) }}</span>
            </mat-list-item>
            <mat-list-item *ngIf="filteredChildren.length === 0">
              <span class="empty-message">{{ ditamapOnly ? 'No DITA maps in this folder' : 'This folder is empty' }}</span>
            </mat-list-item>
          </mat-list>
          <div class="browse-error" *ngIf="browseError">{{ browseError }}</div>
        </mat-tab>
        <mat-tab label="Search">
          <div class="search-section">
            <mat-form-field appearance="outline" class="full-width search-field">
              <mat-label>Search documents</mat-label>
              <input matInput [(ngModel)]="searchQuery" (ngModelChange)="onSearchInput($event)" placeholder="Type to search...">
            </mat-form-field>
            <div class="loading" *ngIf="searchLoading">
              <mat-spinner diameter="32"></mat-spinner>
            </div>
            <mat-list *ngIf="filteredSearchResults.length > 0 && !searchLoading">
              <mat-list-item *ngFor="let item of filteredSearchResults" class="item-row">
                <mat-checkbox
                  [checked]="isSelected(item.id)"
                  (change)="toggleSelection(item)"
                ></mat-checkbox>
                <mat-icon class="item-icon">description</mat-icon>
                <span class="item-title">{{ item.title || item.id }}</span>
                <span class="item-type">{{ item['name'] || formatType(item) }}</span>
              </mat-list-item>
            </mat-list>
            <div class="empty-message" *ngIf="searchQuery.length >= 2 && filteredSearchResults.length === 0 && !searchLoading && !searchError">
              {{ searchResults.length > 0 && ditamapOnly ? 'No DITA maps match your search' : 'No results found' }}
            </div>
            <div class="browse-error" *ngIf="searchError">{{ searchError }}</div>
          </div>
        </mat-tab>
      </mat-tab-group>
      <div class="selection-summary" *ngIf="selectedItems.size > 0 || selectedFolders.size > 0">
        <div *ngIf="selectedFolders.size > 0">
          <strong>{{ selectedFolders.size }} folder(s) selected</strong>
          <div class="folder-entries">
            <div class="folder-entry" *ngFor="let item of selectedFoldersList">
              <div class="folder-chip-row">
                <span class="chip folder-chip">
                  <mat-icon class="chip-folder-icon">folder</mat-icon>
                  {{ item.title || item.id }}
                  <mat-icon class="chip-remove" (click)="removeFolderSelection(item.id)">close</mat-icon>
                </span>
              </div>
              <div class="folder-maps-preview">
                <ng-container *ngIf="folderMaps.get(item.id) as state">
                  <span class="maps-loading" *ngIf="state.loading">Loading maps&hellip;</span>
                  <ng-container *ngIf="!state.loading">
                    <span class="maps-empty" *ngIf="state.maps.length === 0">No DITA maps in this folder</span>
                    <div class="maps-list" *ngIf="state.maps.length > 0">
                      <span class="maps-label">{{ state.maps.length }} map{{ state.maps.length === 1 ? '' : 's' }}:</span>
                      <div class="maps-scroll-wrapper">
                        <ul class="maps-bullet-list">
                          <li *ngFor="let map of state.maps">{{ map.title || map.id }}</li>
                        </ul>
                      </div>
                    </div>
                  </ng-container>
                </ng-container>
              </div>
            </div>
          </div>
        </div>
        <div *ngIf="selectedItems.size > 0" [style.margin-top]="selectedFolders.size > 0 ? '8px' : '0'">
          <strong>{{ selectedItems.size }} document(s) selected</strong>
          <div class="selected-docs">
            <div class="doc-entry" *ngFor="let item of selectedItemsList">
              <div class="doc-chip-row">
                <span class="chip">
                  <mat-icon class="chip-doc-icon">description</mat-icon>
                  {{ item.title || item.id }}
                  <ng-container *ngIf="isDitamap(item)">
                    <button class="release-btn" (click)="toggleReleaseMenu(item.id)">
                      {{ getReleaseName(item.id) }}<mat-icon class="release-arrow">arrow_drop_down</mat-icon>
                    </button>
                  </ng-container>
                  <mat-icon class="chip-remove" (click)="removeSelection(item.id)">close</mat-icon>
                </span>
              </div>
              <div class="release-panel" *ngIf="releaseMenuOpenId === item.id">
                <div class="release-loading" *ngIf="releaseOptions.get(item.id)?.loading">Loading releases&hellip;</div>
                <ng-container *ngIf="!releaseOptions.get(item.id)?.loading">
                  <div class="release-option"
                       [class.release-selected]="!selectedReleases.has(item.id)"
                       (click)="clearRelease(item.id)">
                    Latest (always current)
                  </div>
                  <div class="release-option"
                       *ngFor="let rel of releaseOptions.get(item.id)?.releases"
                       [class.release-selected]="selectedReleases.get(item.id)?.id === rel.id"
                       (click)="selectRelease(item.id, rel)">
                    {{ rel.name }}<span class="release-meta" *ngIf="rel.completedDateTime"> &mdash; {{ formatReleaseDate(rel.completedDateTime) }}</span>
                    <span class="release-branch" *ngIf="rel.branchOfOriginName"> ({{ rel.branchOfOriginName }})</span>
                  </div>
                  <div class="release-empty" *ngIf="releaseOptions.get(item.id)?.releases?.length === 0">
                    No releases available
                  </div>
                </ng-container>
              </div>
            </div>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="confirm()">
        Select ({{ selectedItems.size + selectedFolders.size }})
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .picker-content {
      min-width: 500px;
      min-height: 400px;
      max-height: 70vh;
    }
    .filter-bar {
      display: flex;
      align-items: center;
      padding: 8px 0 4px;
      border-bottom: 1px solid #e0e0e0;
      margin-bottom: 4px;
    }
    .full-width { width: 100%; }
    .search-field { margin-top: 16px; }
    .breadcrumbs {
      padding: 8px 0;
      font-size: 13px;
      color: #666;
    }
    .breadcrumbs a {
      color: #1976d2;
      cursor: pointer;
      text-decoration: none;
    }
    .breadcrumbs a:hover { text-decoration: underline; }
    .item-row {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: default;
    }
    .item-icon { color: #666; margin-right: 4px; vertical-align: middle; }
    .item-title { flex: 1; }
    .item-title.clickable { cursor: pointer; color: #1976d2; }
    .item-title.clickable:hover { text-decoration: underline; }
    .item-type {
      font-size: 12px;
      color: #999;
      text-transform: uppercase;
      margin-left: 5px;
    }
    .loading {
      display: flex;
      justify-content: center;
      padding: 32px;
    }
    .empty-message {
      color: #999;
      font-style: italic;
      padding: 16px 0;
    }
    .browse-error {
      color: #f44336;
      padding: 8px 0;
    }
    .search-section {
      padding-top: 16px;
    }
    .folder-prompt {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding-top: 16px;
    }
    .selection-summary {
      border-top: 1px solid #e0e0e0;
      padding-top: 12px;
      margin-top: 12px;
    }
    .selected-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      background: #e3f2fd;
      border-radius: 16px;
      padding: 2px 8px 2px 12px;
      font-size: 13px;
    }
    .folder-chip {
      background: #fff3e0;
      padding-left: 6px;
    }
    .chip-folder-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
      color: #e65100;
    }
    .folder-entries {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .folder-entry {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .folder-chip-row {
      display: flex;
      align-items: center;
    }
    .folder-maps-preview {
      padding-left: 28px;
      font-size: 12px;
      color: #666;
    }
    .maps-loading {
      font-style: italic;
    }
    .maps-empty {
      font-style: italic;
      color: #999;
    }
    .maps-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .maps-label {
      font-weight: 500;
    }
    .maps-scroll-wrapper {
      position: relative;
    }
    .maps-scroll-wrapper::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 22px;
      background: linear-gradient(transparent, rgba(255,255,255,0.95));
      pointer-events: none;
    }
    .maps-bullet-list {
      max-height: 210px;
      overflow-y: auto;
      overflow-x: hidden;
      margin: 2px 0 0 0;
      padding-left: 16px;
      padding-bottom: 8px;
      color: #444;
    }
    .maps-bullet-list li {
      list-style: disc;
      padding: 1px 0;
    }
    .selected-docs {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .doc-entry {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .doc-chip-row {
      display: flex;
      align-items: center;
    }
    .chip-doc-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
      color: #555;
    }
    .release-btn {
      display: inline-flex;
      align-items: center;
      background: #e8f0fe;
      border: 1px solid #c5d6f8;
      border-radius: 10px;
      padding: 1px 4px 1px 8px;
      font-size: 11px;
      cursor: pointer;
      margin-left: 6px;
      color: #1a73e8;
      white-space: nowrap;
    }
    .release-btn:hover { background: #d2e3fc; }
    .release-arrow {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .release-panel {
      margin-left: 28px;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      overflow: hidden;
      z-index: 10;
    }
    .release-loading {
      padding: 8px 12px;
      font-size: 12px;
      color: #888;
      font-style: italic;
    }
    .release-option {
      padding: 7px 12px;
      font-size: 13px;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .release-option:last-child { border-bottom: none; }
    .release-option:hover { background: #f5f5f5; }
    .release-selected { background: #e8f5e9; font-weight: 500; }
    .release-selected:hover { background: #dcedc8; }
    .release-meta { color: #888; font-size: 12px; }
    .release-branch { color: #aaa; font-size: 11px; }
    .release-empty {
      padding: 8px 12px;
      font-size: 12px;
      color: #999;
      font-style: italic;
    }
    .chip-remove {
      font-size: 16px;
      width: 16px;
      height: 16px;
      cursor: pointer;
      margin-left: 4px;
      color: #666;
    }
    .status-filter-wrap {
      display: inline-flex;
      align-items: center;
      margin-left: 16px;
      gap: 6px;
    }
    .status-filter-label {
      font-size: 13px;
      color: #555;
      white-space: nowrap;
    }
    .status-filter-select {
      height: 28px;
      font-size: 13px;
      border: 1px solid rgba(0,0,0,0.28);
      border-radius: 4px;
      padding: 0 6px;
      background: white;
      color: #333;
      cursor: pointer;
      min-width: 110px;
      max-width: 160px;
    }
    .status-filter-select:focus {
      outline: 2px solid #1976d2;
      border-color: transparent;
    }
    .status-mismatch {
      opacity: 0.4;
    }
    .loading-icon {
      color: #aaa;
    }
  `],
})
export class DocumentPickerComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  currentFolder: CcmsFolder | null = null;
  breadcrumbs: BreadcrumbItem[] = [];
  browseLoading = false;
  browseError = '';

  searchQuery = '';
  searchResults: CcmsResource[] = [];
  searchLoading = false;
  searchError = '';

  ditamapOnly = localStorage.getItem(DITAMAP_ONLY_KEY) === 'true';

  selectedStatusFilter = '';
  statusValues: string[] = [];
  statusValuesLoading = false;
  documentStatuses = new Map<string, string>();
  statusLoadingIds = new Set<string>();

  selectedItems = new Map<string, CcmsResource>();
  selectedFolders = new Map<string, CcmsResource>();
  folderMaps = new Map<string, { loading: boolean; maps: CcmsResource[] }>();
  selectedReleases = new Map<string, CcmsRelease>();
  releaseOptions = new Map<string, { loading: boolean; releases: CcmsRelease[] }>();
  releaseMenuOpenId: string | null = null;

  get filteredChildren(): CcmsResource[] {
    const children = this.currentFolder?.children ?? [];
    if (!this.ditamapOnly || this.data?.allowAllTypes) return children;
    return children.filter(item => item.type === 'folder' || this.isDitamap(item));
  }

  get filteredSearchResults(): CcmsResource[] {
    let results = this.searchResults;
    if (this.ditamapOnly && !this.data?.allowAllTypes) results = results.filter(item => this.isDitamap(item));
    if (this.selectedStatusFilter) results = results.filter(item => item.status === this.selectedStatusFilter);
    return results;
  }

  isDitamap(item: CcmsResource): boolean {
    const type = (item.type || '').toLowerCase();
    const title = (item.title || item.id || '').toLowerCase();
    const name = ((item['name'] as string) || '').toLowerCase();
    // type field may carry MIME type ("application/ditamap+xml"), a short label
    // ("ditamap"), or a generic tag name ("resource") when the XML has no type
    // attribute. The filename (name) or title extension is always reliable.
    return type.includes('ditamap')
      || this.formatType(item).includes('ditamap')
      || title.endsWith('.ditamap')
      || name.endsWith('.ditamap');
  }

  onDitamapOnlyChange(value: boolean) {
    this.ditamapOnly = value;
    localStorage.setItem(DITAMAP_ONLY_KEY, String(value));
  }

  onStatusSelectFocus() {
    if (this.statusValues.length > 0 || this.statusValuesLoading) return;
    this.statusValuesLoading = true;
    this.herettoService.getStatusValues(this.data?.branch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: values => {
          this.statusValues = values;
          this.statusValuesLoading = false;
        },
        error: () => {
          this.statusValuesLoading = false;
        },
      });
  }

  onStatusFilterChange() {
    // Re-run search if there's an active query
    if (this.searchQuery.length >= 2) {
      this._runSearch(this.searchQuery);
    }
    // Fetch statuses for current folder children if filter is active
    if (this.selectedStatusFilter && this.currentFolder) {
      this.fetchStatusForFolder(this.currentFolder.children);
    }
  }

  fetchStatusForFolder(children: CcmsResource[]) {
    if (!this.selectedStatusFilter) return;
    for (const item of children) {
      if (item.type === 'folder') continue;
      if (this.documentStatuses.has(item.id) || this.statusLoadingIds.has(item.id)) continue;
      this.statusLoadingIds.add(item.id);
      this.herettoService.getDocumentStatus(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: result => {
            this.documentStatuses.set(item.id, result.status);
            this.statusLoadingIds.delete(item.id);
          },
          error: () => {
            this.documentStatuses.set(item.id, '');
            this.statusLoadingIds.delete(item.id);
          },
        });
    }
  }

  matchesStatusFilter(item: CcmsResource): boolean {
    if (!this.selectedStatusFilter) return true;
    if (item.type === 'folder') return true;
    if (this.statusLoadingIds.has(item.id)) return true;
    if (!this.documentStatuses.has(item.id)) return true;
    return this.documentStatuses.get(item.id) === this.selectedStatusFilter;
  }

  constructor(
    private herettoService: HerettoService,
    public dialogRef: MatDialogRef<DocumentPickerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DocumentPickerData,
  ) {
    // Pre-select any existing IDs
    if (data?.selectedIds) {
      data.selectedIds.forEach(id => {
        this.selectedItems.set(id, { id, title: id, type: '' });
      });
    }
    if (data?.selectedFolderIds) {
      data.selectedFolderIds.forEach(id => {
        this.selectedFolders.set(id, { id, title: id, type: 'folder' });
        this._fetchFolderMaps(id);
      });
    }
    if (data?.selectedReleases) {
      Object.entries(data.selectedReleases).forEach(([docId, rel]) => {
        this.selectedReleases.set(docId, { id: rel.id, name: rel.name });
      });
    }
  }

  get selectedItemsList(): CcmsResource[] {
    return Array.from(this.selectedItems.values());
  }

  get selectedFoldersList(): CcmsResource[] {
    return Array.from(this.selectedFolders.values());
  }

  isFolderSelected(id: string): boolean {
    return this.selectedFolders.has(id);
  }

  toggleFolderSelection(item: CcmsResource) {
    if (this.selectedFolders.has(item.id)) {
      this.selectedFolders.delete(item.id);
      this.folderMaps.delete(item.id);
    } else {
      this.selectedFolders.set(item.id, item);
      this._fetchFolderMaps(item.id);
    }
  }

  removeFolderSelection(id: string) {
    this.selectedFolders.delete(id);
    this.folderMaps.delete(id);
  }

  private _fetchFolderMaps(folderId: string) {
    this.folderMaps.set(folderId, { loading: true, maps: [] });
    this.herettoService.getFolderContents(folderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (folder: CcmsFolder) => {
          const maps = folder.children.filter(child => this.isDitamap(child));
          this.folderMaps.set(folderId, { loading: false, maps });
        },
        error: () => {
          this.folderMaps.set(folderId, { loading: false, maps: [] });
        },
      });
  }

  ngOnInit() {
    this.navigateToRoot();
  }

  navigateToRoot() {
    this.browseLoading = true;
    this.browseError = '';
    this.herettoService.getRootFolder(this.data?.branch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: folder => {
          this.browseLoading = false;
          this.currentFolder = folder;
          this.breadcrumbs = [{ id: folder.id, title: folder.title || 'Content' }];
          this.fetchStatusForFolder(folder.children);
        },
        error: () => {
          this.browseLoading = false;
          this.browseError = 'Failed to load content folder.';
        },
      });
  }

  navigateToFolder(folderId: string) {
    if (!folderId) return;
    this.browseLoading = true;
    this.browseError = '';
    this.herettoService.getFolderContents(folderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: folder => {
          this.browseLoading = false;
          this.currentFolder = folder;
          // Update breadcrumbs
          const existingIndex = this.breadcrumbs.findIndex(b => b.id === folderId);
          if (existingIndex >= 0) {
            this.breadcrumbs = this.breadcrumbs.slice(0, existingIndex + 1);
          } else {
            this.breadcrumbs.push({ id: folderId, title: folder.title || folderId });
          }
          this.fetchStatusForFolder(folder.children);
        },
        error: () => {
          this.browseLoading = false;
          this.browseError = 'Failed to load folder contents.';
        },
      });
  }

  onSearchInput(query: string) {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchResults = [];
    this.searchError = '';
    if (!query || query.length < 2) {
      this.searchLoading = false;
      return;
    }
    this.searchLoading = true;
    this.searchTimer = setTimeout(() => this._runSearch(query), 300);
  }

  private _runSearch(query: string) {
    if (!query || query.length < 2) return;
    this.searchLoading = true;
    this.searchError = '';
    const searchBody: Record<string, unknown> = { queryString: query };
    if (this.selectedStatusFilter) searchBody['statusFilter'] = this.selectedStatusFilter;
    this.herettoService.searchDocuments(searchBody, this.data?.branch)
      .subscribe({
        next: result => {
          this.searchLoading = false;
          this.searchResults = result.results;
        },
        error: () => {
          this.searchLoading = false;
          this.searchError = 'Search failed. Check your connection.';
        },
      });
  }

  formatType(item: CcmsResource): string {
    let type = item.type || '';
    // Strip "application/" prefix from MIME types (e.g. "application/dita+xml" -> "dita+xml")
    type = type.replace(/^application\//, '');
    // For DITA types, prefer the resourceType/topicType if available (e.g. "topic", "concept", "task")
    const resourceType = item['resourceType'] || item['topicType'] || item['ditaType'];
    if (resourceType && typeof resourceType === 'string' && type.includes('dita')) {
      return resourceType;
    }
    return type;
  }

  isSelected(id: string): boolean {
    return this.selectedItems.has(id);
  }

  toggleSelection(item: CcmsResource) {
    if (this.selectedItems.has(item.id)) {
      this.selectedItems.delete(item.id);
    } else {
      this.selectedItems.set(item.id, item);
    }
  }

  removeSelection(id: string) {
    this.selectedItems.delete(id);
    this.selectedReleases.delete(id);
    this.releaseOptions.delete(id);
    if (this.releaseMenuOpenId === id) this.releaseMenuOpenId = null;
  }

  toggleReleaseMenu(docId: string) {
    if (this.releaseMenuOpenId === docId) {
      this.releaseMenuOpenId = null;
      return;
    }
    this.releaseMenuOpenId = docId;
    if (!this.releaseOptions.has(docId)) {
      this.releaseOptions.set(docId, { loading: true, releases: [] });
      this.herettoService.getReleasesForDocument(docId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: releases => this.releaseOptions.set(docId, { loading: false, releases }),
          error: () => this.releaseOptions.set(docId, { loading: false, releases: [] }),
        });
    }
  }

  selectRelease(docId: string, release: CcmsRelease) {
    this.selectedReleases.set(docId, release);
    this.releaseMenuOpenId = null;
  }

  clearRelease(docId: string) {
    this.selectedReleases.delete(docId);
    this.releaseMenuOpenId = null;
  }

  getReleaseName(docId: string): string {
    return this.selectedReleases.get(docId)?.name ?? 'Latest';
  }

  formatReleaseDate(dt: string): string {
    try {
      return new Date(dt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dt;
    }
  }

  confirm() {
    const releases: Record<string, { id: string; name: string }> = {};
    this.selectedReleases.forEach((rel, docId) => {
      releases[docId] = { id: rel.id, name: rel.name };
    });
    this.dialogRef.close({
      docs: Array.from(this.selectedItems.values()),
      folders: Array.from(this.selectedFolders.values()),
      releases,
    });
  }
}
