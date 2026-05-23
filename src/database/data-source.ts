import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConfig } from './database.config';


export const AppDataSource = new DataSource(
    databaseConfig as DataSourceOptions,
);

export default AppDataSource;