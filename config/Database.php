<?php
/**
 * Database Configuration - PostgreSQL PDO Singleton
 */
class Database {
    private static ?Database $instance = null;
    private ?PDO $connection = null;

    private string $host = 'localhost';
    private string $port = '5432';
    private string $db_name = 'departments_db';
    private string $username = 'postgres';
    private string $password = 'your_password';

    private function __construct() {
        try {
            $dsn = "pgsql:host={$this->host};port={$this->port};dbname={$this->db_name}";
            $this->connection = new PDO($dsn, $this->username, $this->password, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $this->connection->exec("SET NAMES 'utf8'");
        } catch (PDOException $e) {
            throw new Exception('Database connection failed: ' . $e->getMessage());
        }
    }

    public static function getInstance(): Database {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function getConnection(): PDO {
        return $this->connection;
    }
}
