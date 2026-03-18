declare module 'google-trends-api' {
  export function interestOverTime(options: any): Promise<any>;
  export function relatedQueries(options: any): Promise<any>;
  export function relatedTopics(options: any): Promise<any>;
  export function dailyTrends(options: any): Promise<any>;
}
