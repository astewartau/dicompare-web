# DICOMpare - Functional Documentation

## Overview

DICOMpare is a web application designed for medical imaging research that provides privacy-first data validation tools for DICOM (Digital Imaging and Communications in Medicine) files. The application allows researchers to generate standardized DICOM templates and validate data compliance across multi-site studies while ensuring sensitive medical data never leaves the user's environment.

The application operates by interfacing with an underlying pip package called "dicompare" through Pyodide, which enables the execution of Python-based DICOM processing directly in the user's browser without requiring server-side data transmission.

## Core Functionality

The application consists of three main functional areas accessible through a central landing page:

### 1. Landing Page

The landing page serves as the main entry point and information hub for the application. It provides:

- **Application Introduction**: Displays the application name, tagline, and description of its privacy-first approach to medical imaging data validation
- **Feature Selection**: Two primary action cards that allow users to choose between the main application features
- **Public Data Reports**: A searchable, paginated library of example compliance reports and certificates from various medical institutions, including brain MRI studies, spinal MRI quality checks, cardiac MRI metadata integrity reports, and multi-vendor harmonization studies

### 2. Generate Template Workflow

This is a three-step guided process for creating DICOM compliance templates:

#### Step 1: Build Schema
- **DICOM File Upload**: Users can upload DICOM files either by dragging and dropping files/folders or using a file browser
- **Automatic Processing**: The system automatically analyzes uploaded DICOM files to extract metadata and identify unique acquisitions
- **Acquisition Management**: For each identified acquisition, the system creates manageable cards showing:
  - Protocol name and series description
  - Total number of files processed
  - Extracted metadata fields
- **Manual Acquisition Creation**: Users can manually add new acquisitions if needed
- **Field Selection**: For each acquisition, users can select which DICOM fields should be included in the validation template using:
  - Preset field combinations for common imaging types
  - Interactive tag selection from available DICOM fields
- **Field Categorization**: The system automatically organizes DICOM fields into two categories:
  - **Acquisition-level fields**: Fields that have the same value across all series within an acquisition (e.g., MagneticFieldStrength, Manufacturer)
  - **Series-level fields**: Fields that have multiple unique values or unique combinations of values across different series (e.g., ImageType, EchoTime, or combinations like ImageType/FlipAngle)
- **Card-Based Management**: Each acquisition is represented by an interactive card that allows users to:
  - View and edit acquisition metadata
  - Manage constant (acquisition-level) and variable (series-level) field definitions
  - Add, remove, or modify field validation rules
  - Convert fields between acquisition-level and series-level as needed

#### Step 2: Enter Metadata
- **Template Information**: Users provide essential template metadata including:
  - Template name (required)
  - Template description (optional)
  - Authors list (required, with tag-based input)

#### Step 3: Download Schema
- **Template Preview**: Displays the generated template in a formatted, readable view
- **Download Functionality**: Allows users to download the complete template as a structured file for future use

### 3. Check Compliance Workflow

This feature validates DICOM files against existing templates:

#### DICOM Data Loading
- **File Upload**: Users upload DICOM files for validation
- **Example Data**: Option to load pre-configured example DICOM datasets for testing
- **Progress Tracking**: Real-time progress indication during file processing
- **Acquisition Identification**: Automatic detection and organization of different imaging acquisitions within the uploaded data

#### Schema Selection and Pairing
- **Schema Library**: Users can upload, store, and manage validation templates in two formats:
  - **JSON Format**: Structured data format containing field definitions, validation rules, and metadata in a standardized format
  - **Python Format**: Python-based schemas that allow for more complex validation logic and custom rules through executable code
- **Template Selection**: For each DICOM acquisition detected, users can:
  - Select an appropriate validation template from their library
  - Upload new templates as needed in either JSON or Python format
  - Pair DICOM acquisitions with corresponding template schemas
- **Data Visualization**: Option to visualize the DICOM data structure and metadata for each acquisition

#### Compliance Analysis
- **Automated Validation**: The system automatically compares DICOM data against selected templates
- **Field-by-Field Checking**: Validates each specified field according to the template requirements
- **Status Reporting**: Provides clear pass/fail status for each validation rule
- **Error Identification**: Highlights specific compliance issues with detailed error messages
- **Series-Level Validation**: Performs validation at both acquisition and individual series levels

#### Report Generation
- **Compliance Report**: Generates a comprehensive validation report showing:
  - Overall compliance status for each acquisition
  - Detailed field-by-field validation results
  - Error descriptions and recommendations
  - Summary statistics
- **Export Functionality**: Allows users to download the complete compliance report for documentation and sharing

## Key Features and Capabilities

### Data Privacy and Security
- **Local Processing**: All DICOM data processing occurs locally in the user's browser environment
- **No Data Transmission**: Sensitive medical data never leaves the user's system
- **Privacy-First Architecture**: Designed specifically for handling sensitive medical imaging data

### Template Management
- **Flexible Schema Creation**: Support for both automatic template generation from sample data and manual template creation
- **Dual Format Support**: Templates can be created and used in two distinct formats:
  - **JSON Format**: Human-readable structured format ideal for standard validation rules and straightforward field checking
  - **Python Format**: Programmable format that enables complex validation logic, custom calculations, and advanced rule definitions
- **Field Customization**: Ability to specify validation rules for individual DICOM fields including:
  - Exact value matching
  - Value ranges
  - Tolerance-based matching
  - Pattern matching
  - Custom validation logic (in Python format schemas)
- **Template Library**: Personal library system for storing and reusing validation templates in both formats

### Validation Capabilities
- **Multi-Level Validation**: Validation at acquisition, series, and field levels
- **Rule-Based Checking**: Support for various validation rule types including value constraints, ranges, and patterns
- **Comprehensive Reporting**: Detailed compliance reports with actionable feedback
- **Error Tracking**: Clear identification of validation failures with specific error messages

### User Experience
- **Step-by-Step Guidance**: Intuitive multi-step workflows for both template creation and compliance checking
- **Progress Feedback**: Real-time progress indication during data processing operations
- **Interactive Data Exploration**: Ability to examine DICOM metadata and structure before validation
- **Export Options**: Multiple options for saving and sharing templates and compliance reports

## Workflow Integration

The application supports two primary user workflows:

1. **Template Creation Workflow**: For users who need to establish validation standards based on reference DICOM datasets
2. **Compliance Validation Workflow**: For users who need to verify that new DICOM datasets meet established standards

Both workflows are designed to be independent yet complementary, allowing users to create templates once and use them repeatedly for ongoing validation tasks across research projects and collaborations.