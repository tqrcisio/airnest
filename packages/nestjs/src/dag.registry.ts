import { Injectable } from '@nestjs/common';
import type { RegisteredDag } from './compile-dag.js';

@Injectable()
export class DagRegistry {
  private readonly dags = new Map<string, RegisteredDag>();

  register(dag: RegisteredDag) {
    const id = dag.definition.id;
    if (this.dags.has(id)) throw new Error(`DAG ${id} is declared by more than one provider`);
    this.dags.set(id, dag);
  }

  get(dagId: string) {
    const dag = this.dags.get(dagId);
    if (!dag) throw new Error(`DAG ${dagId} is not registered`);
    return dag;
  }

  list() {
    return [...this.dags.values()];
  }
}
