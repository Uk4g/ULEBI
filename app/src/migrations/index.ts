import * as migration_20261102_200716_initial from './20261102_200716_initial';

export const migrations = [
  {
    up: migration_20261102_200716_initial.up,
    down: migration_20261102_200716_initial.down,
    name: '20261102_200716_initial'
  },
];
