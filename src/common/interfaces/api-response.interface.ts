export interface PaginationMeta {
  limit:      number;
  hasMore:    boolean;
  nextCursor: string | null;
}

export interface ApiErrorPayload {
  code:     string;
  message:  string;
  details?: Record<string, string[]>;
}

export class ApiResponse<T> {
  readonly success:   boolean;
  readonly data?:     T;
  readonly meta?:     PaginationMeta | null;
  readonly error?:    ApiErrorPayload;
  readonly timestamp: string;

  private constructor(partial: Omit<ApiResponse<T>, 'timestamp'>) {
    Object.assign(this, partial);
    this.timestamp = new Date().toISOString();
  }

  static ok<T>(data: T, meta?: PaginationMeta): ApiResponse<T> {
    return new ApiResponse<T>({ success: true, data, meta: meta ?? null });
  }

  static fail<T = never>(error: ApiErrorPayload): ApiResponse<T> {
    return new ApiResponse<T>({ success: false, error });
  }
}
