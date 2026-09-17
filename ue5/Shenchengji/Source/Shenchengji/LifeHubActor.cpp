#include "LifeHubActor.h"
#include "CoordinateBridge.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Engine/StaticMesh.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	const TCHAR* ImportedHubMeshes[] = {
		TEXT("life_hub_hub_aluminium"),
		TEXT("life_hub_hub_bike_cream"),
		TEXT("life_hub_hub_bike_teal"),
		TEXT("life_hub_hub_black"),
		TEXT("life_hub_hub_clay"),
		TEXT("life_hub_hub_concrete"),
		TEXT("life_hub_hub_cool_light"),
		TEXT("life_hub_hub_glass"),
		TEXT("life_hub_hub_interior"),
		TEXT("life_hub_hub_leaf"),
		TEXT("life_hub_hub_leaf_lime"),
		TEXT("life_hub_hub_limestone"),
		TEXT("life_hub_hub_pink"),
		TEXT("life_hub_hub_plaster"),
		TEXT("life_hub_hub_product_0"),
		TEXT("life_hub_hub_product_1"),
		TEXT("life_hub_hub_product_2"),
		TEXT("life_hub_hub_product_3"),
		TEXT("life_hub_hub_product_4"),
		TEXT("life_hub_hub_roof"),
		TEXT("life_hub_hub_signs"),
		TEXT("life_hub_hub_teal"),
		TEXT("life_hub_hub_terrazzo"),
		TEXT("life_hub_hub_trim"),
		TEXT("life_hub_hub_warm_light"),
		TEXT("life_hub_hub_wood"),
		TEXT("life_hub_hub_wood_light"),
	};
}

AShenchengjiLifeHubActor::AShenchengjiLifeHubActor()
{
	PrimaryActorTick.bCanEverTick = false;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);
	Canopy = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Canopy"));
	Canopy->SetupAttachment(Root);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		Body->SetStaticMesh(CubeFinder.Object);
		Canopy->SetStaticMesh(CubeFinder.Object);
	}
}

void AShenchengjiLifeHubActor::Place(const FShenchengjiGamePoint& Site)
{
	const FVector Location = FShenchengjiCoordinateBridge::GameToUnreal(Site.BuildingX, Site.BuildingZ, 0.0);
	SetActorTransform(FTransform(FShenchengjiCoordinateBridge::GameYawToUnreal(Site.Heading), Location));
	Body->SetWorldScale3D(FVector(14.1, 10.2, 4.3));
	Body->SetRelativeLocation(FVector(0.f, 0.f, 215.f));
	Canopy->SetRelativeLocation(FVector(0.f, -80.f, 430.f));
	Canopy->SetWorldScale3D(FVector(15.2, 6.4, 0.35));

	UTextRenderComponent* Text = NewObject<UTextRenderComponent>(this);
	Text->RegisterComponent();
	Text->AttachToComponent(RootComponent, FAttachmentTransformRules::KeepRelativeTransform);
	Text->SetRelativeLocation(FVector(0.f, 0.f, 520.f));
	Text->SetText(FText::FromString(Site.Name));
	Text->SetTextRenderColor(FColor(255, 214, 96));
	Text->SetWorldSize(120.f);
	Text->SetHorizontalAlignment(EHTA_Center);

	int32 Loaded = 0;
	for (const TCHAR* Name : ImportedHubMeshes)
	{
		const FString Path = FString::Printf(TEXT("/Game/Imported/LifeHub/%s.%s"), Name, Name);
		if (UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *Path))
		{
			UStaticMeshComponent* Part = NewObject<UStaticMeshComponent>(this, Name);
			Part->SetStaticMesh(Mesh);
			Part->SetupAttachment(RootComponent);
			Part->RegisterComponent();
			++Loaded;
		}
	}
	if (Loaded > 0)
	{
		Body->SetHiddenInGame(true);
		Canopy->SetHiddenInGame(true);
		Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Canopy->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	}
}
