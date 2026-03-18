declare module 'yoastseo' {
  class Paper {
    constructor(text: string, options?: any);
  }

  class Researcher {
    constructor(paper: Paper);
    getResearch(name: string): any;
  }

  class App {
    constructor(options: any);
    runResearch(): void;
    getData(): any;
  }

  const pkg: {
    Paper: typeof Paper;
    Researcher: typeof Researcher;
    default: typeof App;
  };

  export default pkg;
}
