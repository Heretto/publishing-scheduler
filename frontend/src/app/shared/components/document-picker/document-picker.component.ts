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
import { HerettoService, CcmsResource, CcmsFolder } from '../../../core/services/heretto.service';
import { Subject, debounceTime, switchMap, of } from 'rxjs';

const DITAMAP_ONLY_KEY = 'docpicker_ditamap_only';

export interface DocumentPickerData {
  selectedIds: string[];
  branch?: string;
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
      <div class="filter-bar">
        <mat-slide-toggle
          [checked]="ditamapOnly"
          (change)="onDitamapOnlyChange($event.checked)"
          color="primary">
          DITA maps only
        </mat-slide-toggle>
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
            <mat-list-item *ngFor="let item of filteredChildren" class="item-row">
              <mat-checkbox
                [checked]="isSelected(item.id)"
                (change)="toggleSelection(item)"
                [style.visibility]="item.type === 'folder' ? 'hidden' : 'visible'"
              ></mat-checkbox>
              <mat-icon class="item-icon">{{ item.type === 'folder' ? 'folder' : 'description' }}</mat-icon>
              <span class="item-title"
                [class.clickable]="item.type === 'folder'"
                (click)="item.type === 'folder' ? navigateToFolder(item.id) : null">
                {{ item.title || item.id }}
              </span>
              <span class="item-type">{{ formatType(item) }}</span>
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
                <span class="item-type">{{ formatType(item) }}</span>
              </mat-list-item>
            </mat-list>
            <div class="empty-message" *ngIf="searchQuery.length >= 2 && filteredSearchResults.length === 0 && !searchLoading && !searchError">
              {{ searchResults.length > 0 && ditamapOnly ? 'No DITA maps match your search' : 'No results found' }}
            </div>
            <div class="browse-error" *ngIf="searchError">{{ searchError }}</div>
          </div>
        </mat-tab>
      </mat-tab-group>
      <div class="selection-summary" *ngIf="selectedItems.size > 0">
        <strong>{{ selectedItems.size }} document(s) selected</strong>
        <div class="selected-chips">
          <span class="chip" *ngFor="let item of selectedItemsList">
            {{ item.title || item.id }}
            <mat-icon class="chip-remove" (click)="removeSelection(item.id)">close</mat-icon>
          </span>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="confirm()">
        Select ({{ selectedItems.size }})
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
    .chip-remove {
      font-size: 16px;
      width: 16px;
      height: 16px;
      cursor: pointer;
      margin-left: 4px;
      color: #666;
    }
  `],
})
export class DocumentPickerComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private searchSubject = new Subject<string>();

  currentFolder: CcmsFolder | null = null;
  breadcrumbs: BreadcrumbItem[] = [];
  browseLoading = false;
  browseError = '';

  searchQuery = '';
  searchResults: CcmsResource[] = [];
  searchLoading = false;
  searchError = '';

  ditamapOnly = localStorage.getItem(DITAMAP_ONLY_KEY) === 'true';

  selectedItems = new Map<string, CcmsResource>();

  get filteredChildren(): CcmsResource[] {
    const children = this.currentFolder?.children ?? [];
    if (!this.ditamapOnly) return children;
    return children.filter(item => item.type === 'folder' || this.isDitamap(item));
  }

  get filteredSearchResults(): CcmsResource[] {
    if (!this.ditamapOnly) return this.searchResults;
    return this.searchResults.filter(item => this.isDitamap(item));
  }

  isDitamap(item: CcmsResource): boolean {
    const type = (item.type || '').toLowerCase();
    const title = (item.title || item.id || '').toLowerCase();
    // type field may carry MIME type ("application/ditamap+xml"), a short label
    // ("ditamap"), or a generic tag name ("resource") when the XML has no type
    // attribute. The filename extension is always present and reliable.
    return type.includes('ditamap')
      || this.formatType(item).includes('ditamap')
      || title.endsWith('.ditamap');
  }

  onDitamapOnlyChange(value: boolean) {
    this.ditamapOnly = value;
    localStorage.setItem(DITAMAP_ONLY_KEY, String(value));
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
  }

  get selectedItemsList(): CcmsResource[] {
    return Array.from(this.selectedItems.values());
  }

  ngOnInit() {
    this.navigateToRoot();
    this.searchSubject.pipe(
      debounceTime(300),
      switchMap(query => {
        if (!query || query.length < 2) {
          this.searchLoading = false;
          return of(null);
        }
        this.searchLoading = true;
        this.searchError = '';
        return this.herettoService.searchDocuments({ queryString: query }, this.data?.branch);
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: result => {
        this.searchLoading = false;
        if (result) {
          this.searchResults = result.results;
        } else {
          this.searchResults = [];
        }
      },
      error: () => {
        this.searchLoading = false;
        this.searchError = 'Search failed. Check your connection.';
      },
    });
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
        },
        error: () => {
          this.browseLoading = false;
          this.browseError = 'Failed to load folder contents.';
        },
      });
  }

  onSearchInput(query: string) {
    this.searchSubject.next(query);
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
  }

  confirm() {
    const items = Array.from(this.selectedItems.values());
    this.dialogRef.close(items);
  }
}
