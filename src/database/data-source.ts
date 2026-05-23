import { DataSource, DataSourceOptions } from 'typeorm';
import { databaseConfig } from './database.config';


const AppDataSource = new DataSource(
    databaseConfig as DataSourceOptions,
);

export default AppDataSource;