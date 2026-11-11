export type Response<T> = {
  items: T;
  errors?: ErrorResponse[];
};

export type ErrorResponse = {
  reason: string;
  description: string;
};
