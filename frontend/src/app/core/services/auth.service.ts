import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap, catchError, throwError, of } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  organizations: OrgInfo[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = '/api/v1';

  private _user$ = new BehaviorSubject<AuthUser | null>(null);
  readonly user$ = this._user$.asObservable();
  readonly isLoggedIn$ = new BehaviorSubject<boolean>(false);

  private _accessToken: string | null = null;

  get accessToken(): string | null {
    return this._accessToken;
  }

  get currentUser(): AuthUser | null {
    return this._user$.value;
  }

  constructor(private http: HttpClient, private router: Router) {}

  /** Called once at app startup — tries to restore session from HttpOnly cookie. */
  async initializeAuth(): Promise<void> {
    try {
      await this.refresh().toPromise();
    } catch {
      // No valid session — user will be redirected by the guard
    }
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.base}/auth/login`, { email, password }, { withCredentials: true })
      .pipe(
        tap(res => {
          this._accessToken = res.access_token;
          this.isLoggedIn$.next(true);
          this.loadCurrentUser().subscribe();
        }),
      );
  }

  logout(): Observable<void> {
    return this.http
      .post<void>(`${this.base}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => this._clearSession()),
        catchError(err => {
          this._clearSession();
          return throwError(() => err);
        }),
      );
  }

  refresh(): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.base}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        tap(res => {
          this._accessToken = res.access_token;
          this.isLoggedIn$.next(true);
        }),
        catchError(err => {
          this._clearSession();
          return throwError(() => err);
        }),
      );
  }

  loadCurrentUser(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.base}/account/me`, { withCredentials: true })
      .pipe(tap(user => this._user$.next(user)));
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, new_password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/auth/reset-password`, {
      token,
      new_password,
    });
  }

  getInvitationInfo(token: string): Observable<{ email: string; organization_name: string }> {
    return this.http.get<{ email: string; organization_name: string }>(
      `${this.base}/invitations/info/${token}`,
    );
  }

  acceptInvitationNewUser(
    token: string,
    password: string,
  ): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.base}/invitations/accept/${token}`, {
      password,
    }, { withCredentials: true });
  }

  acceptInvitationExistingUser(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/organizations/invitations/accept/${token}`,
      {},
      { withCredentials: true },
    );
  }

  private _clearSession(): void {
    this._accessToken = null;
    this._user$.next(null);
    this.isLoggedIn$.next(false);
  }
}
