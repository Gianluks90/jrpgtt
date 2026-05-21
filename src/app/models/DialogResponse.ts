export interface DialogResponse<TData = unknown> {
    result: "confirm" | "cancel";
    data?: TData;
}