/**
 * External dependencies
 */
import {
	every,
	filter,
	forEach,
	get,
	isEmpty,
	map,
	reduce,
	some,
	toString,
	isEqual,
} from 'lodash';

/**
 * WordPress dependencies
 */
import { compose } from '@wordpress/compose';
import {
	PanelBody,
	SelectControl,
	ToggleControl,
	withNotices,
	RangeControl,
} from '@wordpress/components';
import { MediaPlaceholder, InspectorControls } from '@wordpress/block-editor';
import { Component, Platform } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { getBlobByURL, isBlobURL, revokeBlobURL } from '@wordpress/blob';
import { withSelect, withDispatch } from '@wordpress/data';
import { withViewportMatch } from '@wordpress/viewport';
import { createBlock } from '@wordpress/blocks';

/**
 * Internal dependencies
 */
import { sharedIcon } from './shared-icon';
import { defaultColumnsNumber, pickRelevantMediaFiles } from './shared';
import Gallery from './gallery';
import {
	LINK_DESTINATION_ATTACHMENT,
	LINK_DESTINATION_MEDIA,
	LINK_DESTINATION_NONE,
} from './constants';

const MAX_COLUMNS = 8;
const linkOptions = [
	{ value: LINK_DESTINATION_ATTACHMENT, label: __( 'Attachment Page' ) },
	{ value: LINK_DESTINATION_MEDIA, label: __( 'Media File' ) },
	{ value: LINK_DESTINATION_NONE, label: __( 'None' ) },
];
const ALLOWED_MEDIA_TYPES = [ 'image' ];

const PLACEHOLDER_TEXT = Platform.select( {
	web: __(
		'Drag images, upload new ones or select files from your library.'
	),
	native: __( 'ADD MEDIA' ),
} );

const MOBILE_CONTROL_PROPS_RANGE_CONTROL = Platform.select( {
	web: {},
	native: { type: 'stepper' },
} );

class GalleryEdit extends Component {
	constructor() {
		super( ...arguments );

		this.onSelectImages = this.onSelectImages.bind( this );
		this.setLinkTo = this.setLinkTo.bind( this );
		this.setColumnsNumber = this.setColumnsNumber.bind( this );
		this.toggleImageCrop = this.toggleImageCrop.bind( this );
		this.onRemoveImage = this.onRemoveImage.bind( this );
		this.onUploadError = this.onUploadError.bind( this );
		this.setAttributes = this.setAttributes.bind( this );
		this.getImagesSizeOptions = this.getImagesSizeOptions.bind( this );
		this.updateImagesSize = this.updateImagesSize.bind( this );

		this.state = {
			selectedImage: null,
			attachmentCaptions: null,
			images: [],
		};
	}

	setAttributes( attributes ) {
		this.props.setAttributes( attributes );
	}

	onRemoveImage( index ) {
		return () => {
			const images = filter(
				this.props.attributes.images,
				( img, i ) => index !== i
			);
			const { columns } = this.props.attributes;
			this.setState( { selectedImage: null } );
			this.setAttributes( {
				images,
				columns: columns ? Math.min( images.length, columns ) : columns,
			} );
		};
	}

	onSelectImages( newImages ) {
		const { clientId, replaceInnerBlocks } = this.props;
		const { columns, linkTo, sizeSlug } = this.props.attributes;

		const newBlocks = newImages.map( ( image ) => {
			const newImageAttribs = pickRelevantMediaFiles( image, sizeSlug );

			return createBlock( 'core/image', {
				...newImageAttribs,
				id: image.id,
				linkDestination: linkTo,
			} );
		} );

		this.setState( {
			images: newImages.map( ( newImage ) => ( {
				id: toString( newImage.id ),
				url: newImage.url,
			} ) ),
			columns: columns ? Math.min( newImages.length, columns ) : columns,
		} );

		replaceInnerBlocks( clientId, newBlocks );
	}

	onUploadError( message ) {
		const { noticeOperations } = this.props;
		noticeOperations.removeAllNotices();
		noticeOperations.createErrorNotice( message );
	}

	setLinkTo( value ) {
		this.setAttributes( { linkTo: value } );
	}

	setColumnsNumber( value ) {
		this.setAttributes( { columns: value } );
	}

	toggleImageCrop() {
		this.setAttributes( { imageCrop: ! this.props.attributes.imageCrop } );
	}

	getImageCropHelp( checked ) {
		return checked
			? __( 'Thumbnails are cropped to align.' )
			: __( 'Thumbnails are not cropped.' );
	}

	getImagesSizeOptions() {
		const { imageSizes, resizedImages } = this.props;
		return map(
			filter( imageSizes, ( { slug } ) =>
				some( resizedImages, ( sizes ) => sizes[ slug ] )
			),
			( { name, slug } ) => ( { value: slug, label: name } )
		);
	}

	updateImagesSize( sizeSlug ) {
		const {
			attributes: { images },
			resizedImages,
		} = this.props;

		const updatedImages = map( images, ( image ) => {
			if ( ! image.id ) {
				return image;
			}
			const url = get( resizedImages, [
				parseInt( image.id, 10 ),
				sizeSlug,
			] );
			return {
				...image,
				...( url && { url } ),
			};
		} );

		this.setAttributes( { images: updatedImages, sizeSlug } );
	}

	componentDidMount() {
		const { attributes, mediaUpload } = this.props;
		let images;
		if ( attributes.imageUploads?.length > 0 ) {
			images = attributes.imageUploads;
			this.setAttributes( { imageUploads: undefined } );
		} else {
			images = this.props
				.getBlock( this.props.clientId )
				.innerBlocks.map( ( block ) => {
					return {
						id: block.attributes.id,
						url: block.attributes.url,
					};
				} );
		}

		if ( ! isEqual( images, this.state.images ) ) {
			this.setState( {
				images,
			} );
		}

		if (
			Platform.OS === 'web' &&
			images &&
			images.length > 0 &&
			every( images, ( { url } ) => isBlobURL( url ) )
		) {
			const filesList = map( images, ( { url } ) => getBlobByURL( url ) );
			forEach( images, ( { url } ) => revokeBlobURL( url ) );
			mediaUpload( {
				filesList,
				onFileChange: this.onSelectImages,
				allowedTypes: [ 'image' ],
			} );
		}
	}

	componentDidUpdate( prevProps ) {
		const images = this.props
			.getBlock( this.props.clientId )
			.innerBlocks.map( ( block ) => {
				return { id: block.attributes.id, url: block.attributes.url };
			} );
		if ( ! isEqual( images, this.state.images ) ) {
			this.setState( {
				images,
			} );
		}

		// Deselect images when deselecting the block
		if ( ! this.props.isSelected && prevProps.isSelected ) {
			this.setState( {
				selectedImage: null,
				captionSelected: false,
			} );
		}
		// linkTo attribute must be saved so blocks don't break when changing image_default_link_type in options.php
		if ( ! this.props.attributes.linkTo ) {
			this.setAttributes( {
				linkTo:
					window?.wp?.media?.view?.settings?.defaultProps?.link ||
					LINK_DESTINATION_NONE,
			} );
		}
	}

	render() {
		const {
			attributes,
			className,
			isSelected,
			noticeUI,
			insertBlocksAfter,
		} = this.props;
		const images = this.state.images;
		const {
			columns = defaultColumnsNumber( images ),
			imageCrop,
			linkTo,
			sizeSlug,
		} = attributes;

		const hasImages = !! images.length;

		const mediaPlaceholder = (
			<MediaPlaceholder
				addToGallery={ hasImages }
				isAppender={ hasImages }
				className={ className }
				disableMediaButtons={ hasImages && ! isSelected }
				icon={ ! hasImages && sharedIcon }
				labels={ {
					title: ! hasImages && __( 'Gallery' ),
					instructions: ! hasImages && PLACEHOLDER_TEXT,
				} }
				onSelect={ this.onSelectImages }
				accept="image/*"
				allowedTypes={ ALLOWED_MEDIA_TYPES }
				multiple
				value={ images }
				onError={ this.onUploadError }
				notices={ hasImages ? undefined : noticeUI }
				onFocus={ this.props.onFocus }
			/>
		);

		if ( ! hasImages ) {
			return mediaPlaceholder;
		}

		const imageSizeOptions = this.getImagesSizeOptions();
		const shouldShowSizeOptions =
			hasImages && ! isEmpty( imageSizeOptions );

		return (
			<>
				<InspectorControls>
					<PanelBody title={ __( 'Gallery settings' ) }>
						{ images.length > 1 && (
							<RangeControl
								label={ __( 'Columns' ) }
								value={ columns }
								onChange={ this.setColumnsNumber }
								min={ 1 }
								max={ Math.min( MAX_COLUMNS, images.length ) }
								{ ...MOBILE_CONTROL_PROPS_RANGE_CONTROL }
								required
							/>
						) }

						<ToggleControl
							label={ __( 'Crop images' ) }
							checked={ !! imageCrop }
							onChange={ this.toggleImageCrop }
							help={ this.getImageCropHelp }
						/>
						<SelectControl
							label={ __( 'Link to' ) }
							value={ linkTo }
							onChange={ this.setLinkTo }
							options={ linkOptions }
						/>
						{ shouldShowSizeOptions && (
							<SelectControl
								label={ __( 'Image size' ) }
								value={ sizeSlug }
								options={ imageSizeOptions }
								onChange={ this.updateImagesSize }
							/>
						) }
					</PanelBody>
				</InspectorControls>
				{ noticeUI }
				<Gallery
					{ ...this.props }
					images={ images }
					selectedImage={ this.state.selectedImage }
					mediaPlaceholder={ mediaPlaceholder }
					onMoveBackward={ this.onMoveBackward }
					onMoveForward={ this.onMoveForward }
					onRemoveImage={ this.onRemoveImage }
					onSelectImage={ this.onSelectImage }
					onDeselectImage={ this.onDeselectImage }
					onSetImageAttributes={ this.setImageAttributes }
					onFocusGalleryCaption={ this.onFocusGalleryCaption }
					insertBlocksAfter={ insertBlocksAfter }
				/>
			</>
		);
	}
}
export default compose( [
	withSelect( ( select, { isSelected } ) => {
		const { getMedia } = select( 'core' );
		const { getSettings, getBlock } = select( 'core/block-editor' );
		const { imageSizes, mediaUpload } = getSettings();

		let resizedImages = {};

		// if ( isSelected ) {
		// 	resizedImages = reduce(
		// 		images,
		// 		( currentResizedImages, img ) => {
		// 			if ( ! img.id ) {
		// 				return currentResizedImages;
		// 			}
		// 			const image = getMedia( img.id );
		// 			const sizes = reduce(
		// 				imageSizes,
		// 				( currentSizes, size ) => {
		// 					const defaultUrl = get( image, [
		// 						'sizes',
		// 						size.slug,
		// 						'url',
		// 					] );
		// 					const mediaDetailsUrl = get( image, [
		// 						'media_details',
		// 						'sizes',
		// 						size.slug,
		// 						'source_url',
		// 					] );
		// 					return {
		// 						...currentSizes,
		// 						[ size.slug ]: defaultUrl || mediaDetailsUrl,
		// 					};
		// 				},
		// 				{}
		// 			);
		// 			return {
		// 				...currentResizedImages,
		// 				[ parseInt( img.id, 10 ) ]: sizes,
		// 			};
		// 		},
		// 		{}
		// 	);
		// }

		return {
			imageSizes,
			mediaUpload,
			resizedImages,
			getBlock,
		};
	} ),
	withNotices,
	withViewportMatch( { isNarrow: '< small' } ),
	withDispatch( ( dispatch ) => {
		const { replaceInnerBlocks } = dispatch( 'core/block-editor' );
		return {
			replaceInnerBlocks,
		};
	} ),
] )( GalleryEdit );
